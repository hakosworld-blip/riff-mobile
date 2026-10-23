import UIKit
import Capacitor
import AVFoundation
import MediaPlayer

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

/// The stock Capacitor bridge, with Riff's app-local plugin registered.
class RiffBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(RiffBackgroundAudioPlugin())
    }
}

/**
 * Native half of Riff's background playback.
 *
 * Audio decoding stays in the WebView (EQ, DSP and the analyser keep working).
 * This plugin activates a playback audio session so WebKit keeps the media
 * element running in the background, publishes Now Playing metadata, and
 * forwards lock-screen / Control Center commands to the web layer.
 */
@objc(RiffBackgroundAudioPlugin)
public class RiffBackgroundAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RiffBackgroundAudioPlugin"
    public let jsName = "RiffBackgroundAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "enable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setPosition", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disable", returnType: CAPPluginReturnPromise)
    ]

    private var commandTargets: [(MPRemoteCommand, Any)] = []
    private var sessionActive = false
    private var artworkTask: URLSessionDataTask?
    private var artworkURL = ""
    private var nowPlaying: [String: Any] = [:]
    private var interruptionObserver: NSObjectProtocol?

    // MARK: - Plugin methods

    @objc func enable(_ call: CAPPluginCall) {
        activateSession()
        installRemoteCommands()
        applyMetadata(call)
        call.resolve()
    }

    @objc func update(_ call: CAPPluginCall) {
        activateSession()
        installRemoteCommands()
        applyMetadata(call)
        call.resolve()
    }

    @objc func setPosition(_ call: CAPPluginCall) {
        if let position = call.getDouble("position") {
            nowPlaying[MPNowPlayingInfoPropertyElapsedPlaybackTime] = max(0, position)
        }
        if let duration = call.getDouble("duration"), duration > 0 {
            nowPlaying[MPMediaItemPropertyPlaybackDuration] = duration
        }
        if let playing = call.getBool("playing") {
            nowPlaying[MPNowPlayingInfoPropertyPlaybackRate] = playing ? 1.0 : 0.0
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlaying
        call.resolve()
    }

    @objc func disable(_ call: CAPPluginCall) {
        artworkTask?.cancel()
        artworkTask = nil
        artworkURL = ""
        nowPlaying = [:]
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        removeRemoteCommands()
        if let observer = interruptionObserver {
            NotificationCenter.default.removeObserver(observer)
            interruptionObserver = nil
        }
        if sessionActive {
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            sessionActive = false
        }
        call.resolve()
    }

    // MARK: - Audio session

    private func activateSession() {
        let session = AVAudioSession.sharedInstance()
        guard !sessionActive else { return }
        do {
            try session.setCategory(.playback, mode: .default, options: [])
            try session.setActive(true)
            sessionActive = true
        } catch {
            CAPLog.print("Riff: could not activate the audio session: \(error.localizedDescription)")
        }
        if interruptionObserver == nil {
            interruptionObserver = NotificationCenter.default.addObserver(
                forName: AVAudioSession.interruptionNotification,
                object: nil,
                queue: .main
            ) { [weak self] note in
                guard
                    let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                    let type = AVAudioSession.InterruptionType(rawValue: raw)
                else { return }
                if type == .began {
                    self?.notifyListeners("command", data: ["action": "pause", "position": 0])
                }
            }
        }
    }

    // MARK: - Now Playing

    private func applyMetadata(_ call: CAPPluginCall) {
        let title = call.getString("title") ?? "Riff"
        let artist = call.getString("artist") ?? ""
        let album = call.getString("album") ?? ""

        nowPlaying[MPMediaItemPropertyTitle] = title
        nowPlaying[MPMediaItemPropertyArtist] = artist
        nowPlaying[MPMediaItemPropertyAlbumTitle] = album
        nowPlaying[MPNowPlayingInfoPropertyMediaType] = MPNowPlayingInfoMediaType.audio.rawValue
        nowPlaying[MPNowPlayingInfoPropertyIsLiveStream] = false

        if let duration = call.getDouble("duration"), duration > 0 {
            nowPlaying[MPMediaItemPropertyPlaybackDuration] = duration
        }
        if let position = call.getDouble("position") {
            nowPlaying[MPNowPlayingInfoPropertyElapsedPlaybackTime] = max(0, position)
        }
        let playing = call.getBool("playing") ?? true
        nowPlaying[MPNowPlayingInfoPropertyPlaybackRate] = playing ? 1.0 : 0.0

        if let artwork = call.getString("artwork"), !artwork.isEmpty, artwork != artworkURL {
            loadArtwork(artwork)
        }

        MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlaying
    }

    private func loadArtwork(_ urlString: String) {
        guard let url = URL(string: urlString) else { return }
        artworkURL = urlString
        artworkTask?.cancel()
        artworkTask = URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard
                let self,
                let data,
                let image = UIImage(data: data),
                self.artworkURL == urlString
            else { return }
            let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
            DispatchQueue.main.async {
                self.nowPlaying[MPMediaItemPropertyArtwork] = artwork
                MPNowPlayingInfoCenter.default().nowPlayingInfo = self.nowPlaying
            }
        }
        artworkTask?.resume()
    }

    // MARK: - Remote commands

    private func installRemoteCommands() {
        guard commandTargets.isEmpty else { return }
        let center = MPRemoteCommandCenter.shared()

        center.playCommand.isEnabled = true
        center.pauseCommand.isEnabled = true
        center.togglePlayPauseCommand.isEnabled = true
        center.nextTrackCommand.isEnabled = true
        center.previousTrackCommand.isEnabled = true
        center.changePlaybackPositionCommand.isEnabled = true

        addTarget(center.playCommand, action: "play")
        addTarget(center.pauseCommand, action: "pause")
        addTarget(center.togglePlayPauseCommand, action: "toggle")
        addTarget(center.nextTrackCommand, action: "next")
        addTarget(center.previousTrackCommand, action: "previous")

        let seek = center.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else {
                return .commandFailed
            }
            self?.notifyListeners("command", data: ["action": "seek", "position": event.positionTime])
            return .success
        }
        commandTargets.append((center.changePlaybackPositionCommand, seek))
    }

    private func addTarget(_ command: MPRemoteCommand, action: String) {
        let target = command.addTarget { [weak self] _ in
            self?.notifyListeners("command", data: ["action": action, "position": 0])
            return .success
        }
        commandTargets.append((command, target))
    }

    private func removeRemoteCommands() {
        for (command, target) in commandTargets {
            command.removeTarget(target)
        }
        commandTargets.removeAll()
    }
}
