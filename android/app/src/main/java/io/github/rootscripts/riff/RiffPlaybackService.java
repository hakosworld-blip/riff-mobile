package io.github.rootscripts.riff;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import java.net.URL;

/**
 * Media foreground service for Riff Mobile.
 *
 * It does not decode audio: the WebView keeps playing through the shared
 * RiffAudioEngine. The service exists so Android treats the app as an active
 * media session (process not frozen, notification + lock-screen controls).
 */
public class RiffPlaybackService extends Service {

    static final String ACTION_START = "io.github.rootscripts.riff.START";
    static final String ACTION_UPDATE = "io.github.rootscripts.riff.UPDATE";
    static final String ACTION_POSITION = "io.github.rootscripts.riff.POSITION";
    static final String ACTION_TOGGLE = "io.github.rootscripts.riff.TOGGLE";
    static final String ACTION_PLAY = "io.github.rootscripts.riff.PLAY";
    static final String ACTION_PAUSE = "io.github.rootscripts.riff.PAUSE";
    static final String ACTION_NEXT = "io.github.rootscripts.riff.NEXT";
    static final String ACTION_PREVIOUS = "io.github.rootscripts.riff.PREVIOUS";
    static final String ACTION_STOP = "io.github.rootscripts.riff.STOP";

    static final String EXTRA_TITLE = "title";
    static final String EXTRA_ARTIST = "artist";
    static final String EXTRA_ALBUM = "album";
    static final String EXTRA_ARTWORK = "artwork";
    static final String EXTRA_DURATION = "duration";
    static final String EXTRA_POSITION = "position";
    static final String EXTRA_PLAYING = "playing";

    private static final String CHANNEL_ID = "riff_playback";
    private static final int NOTIFICATION_ID = 4217;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private NotificationManager notificationManager;
    private MediaSession mediaSession;

    private String title = "Riff";
    private String artist = "";
    private String album = "";
    private String artworkUrl = "";
    private Bitmap artwork;
    private double duration = 0;
    private double position = 0;
    private boolean playing = true;
    private boolean foregroundStarted = false;

    @Override
    public void onCreate() {
        super.onCreate();
        notificationManager = getSystemService(NotificationManager.class);
        createChannel();
        mediaSession = new MediaSession(this, "Riff");
        mediaSession.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
        mediaSession.setSessionActivity(contentIntent());
        mediaSession.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { setPlaying(true); RiffBackgroundAudioPlugin.command("play"); }
            @Override public void onPause() { setPlaying(false); RiffBackgroundAudioPlugin.command("pause"); }
            @Override public void onSkipToNext() { RiffBackgroundAudioPlugin.command("next"); }
            @Override public void onSkipToPrevious() { RiffBackgroundAudioPlugin.command("previous"); }
            @Override public void onSeekTo(long pos) { RiffBackgroundAudioPlugin.command("seek", pos / 1000.0); }
        });
        mediaSession.setActive(true);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || intent.getAction() == null) return START_STICKY;

        switch (intent.getAction()) {
            case ACTION_START:
            case ACTION_UPDATE:
                readMetadata(intent);
                readPosition(intent);
                pushState();
                ensureForeground();
                break;
            case ACTION_POSITION:
                readPosition(intent);
                pushState();
                updateNotification();
                break;
            case ACTION_TOGGLE:
                setPlaying(!playing);
                RiffBackgroundAudioPlugin.command("toggle");
                break;
            case ACTION_PLAY:
                setPlaying(true);
                RiffBackgroundAudioPlugin.command("play");
                break;
            case ACTION_PAUSE:
                setPlaying(false);
                RiffBackgroundAudioPlugin.command("pause");
                break;
            case ACTION_NEXT:
                RiffBackgroundAudioPlugin.command("next");
                break;
            case ACTION_PREVIOUS:
                RiffBackgroundAudioPlugin.command("previous");
                break;
            case ACTION_STOP:
                shutdown();
                return START_NOT_STICKY;
            default:
                break;
        }
        return START_STICKY;
    }

    private void readMetadata(Intent intent) {
        title = value(intent, EXTRA_TITLE, title);
        artist = value(intent, EXTRA_ARTIST, artist);
        album = value(intent, EXTRA_ALBUM, album);
        String nextArtwork = value(intent, EXTRA_ARTWORK, "");
        if (!nextArtwork.equals(artworkUrl)) {
            artworkUrl = nextArtwork;
            artwork = null;
            loadArtwork();
        }
        if (intent.hasExtra(EXTRA_DURATION)) {
            duration = intent.getDoubleExtra(EXTRA_DURATION, duration);
        }
    }

    private void readPosition(Intent intent) {
        if (intent.hasExtra(EXTRA_POSITION)) {
            position = intent.getDoubleExtra(EXTRA_POSITION, position);
        }
        if (intent.hasExtra(EXTRA_DURATION)) {
            duration = intent.getDoubleExtra(EXTRA_DURATION, duration);
        }
        if (intent.hasExtra(EXTRA_PLAYING)) {
            playing = intent.getBooleanExtra(EXTRA_PLAYING, playing);
        }
    }

    private String value(Intent intent, String key, String fallback) {
        String text = intent.getStringExtra(key);
        return text == null || text.isEmpty() ? fallback : text;
    }

    private void ensureForeground() {
        Notification notification = buildNotification();
        if (!foregroundStarted) {
            foregroundStarted = true;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } else {
            notificationManager.notify(NOTIFICATION_ID, notification);
        }
    }

    private void updateNotification() {
        if (!foregroundStarted) return;
        notificationManager.notify(NOTIFICATION_ID, buildNotification());
    }

    /** Flips the session state immediately so the notification reacts even if
     *  the WebView thread is briefly suspended; JS sends the authoritative
     *  state right after. */
    private void setPlaying(boolean value) {
        playing = value;
        pushState();
        updateNotification();
    }

    private void pushState() {
        long positionMs = Math.max(0, Math.round(position * 1000));
        long durationMs = Math.max(0, Math.round(duration * 1000));

        MediaMetadata.Builder meta = new MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, title)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
            .putString(MediaMetadata.METADATA_KEY_ALBUM, album)
            .putLong(MediaMetadata.METADATA_KEY_DURATION, durationMs);
        if (artwork != null) {
            meta.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, artwork);
        }
        mediaSession.setMetadata(meta.build());

        PlaybackState.Builder state = new PlaybackState.Builder()
            .setActions(
                PlaybackState.ACTION_PLAY |
                PlaybackState.ACTION_PAUSE |
                PlaybackState.ACTION_PLAY_PAUSE |
                PlaybackState.ACTION_SKIP_TO_NEXT |
                PlaybackState.ACTION_SKIP_TO_PREVIOUS |
                PlaybackState.ACTION_SEEK_TO
            )
            .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, positionMs, playing ? 1f : 0f);
        mediaSession.setPlaybackState(state.build());
    }

    private void loadArtwork() {
        if (artworkUrl == null || artworkUrl.isEmpty()) return;
        final String target = artworkUrl;
        new Thread(() -> {
            Bitmap bitmap = null;
            try {
                URL url = new URL(target);
                bitmap = BitmapFactory.decodeStream(url.openConnection().getInputStream());
            } catch (Exception ignored) {
            }
            final Bitmap loaded = bitmap;
            mainHandler.post(() -> {
                if (!target.equals(artworkUrl)) return;
                artwork = loaded;
                pushState();
                if (foregroundStarted) notificationManager.notify(NOTIFICATION_ID, buildNotification());
            });
        }, "riff-artwork").start();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Playback", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Riff playback controls");
        channel.setShowBadge(false);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        notificationManager.createNotificationChannel(channel);
    }

    private PendingIntent contentIntent() {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private PendingIntent actionIntent(String action, int requestCode) {
        Intent intent = new Intent(this, RiffPlaybackService.class);
        intent.setAction(action);
        return PendingIntent.getService(this, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @SuppressWarnings("deprecation")
    private Notification buildNotification() {
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);

        builder.setSmallIcon(R.drawable.ic_stat_riff)
            .setContentTitle(title)
            .setContentText(artist)
            .setContentIntent(contentIntent())
            .setShowWhen(false)
            .setOnlyAlertOnce(true)
            .setOngoing(playing)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setCategory(Notification.CATEGORY_TRANSPORT);

        if (artwork != null) builder.setLargeIcon(artwork);

        builder.addAction(android.R.drawable.ic_media_previous, "Previous", actionIntent(ACTION_PREVIOUS, 11));
        builder.addAction(
            playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
            playing ? "Pause" : "Play",
            actionIntent(ACTION_TOGGLE, 12)
        );
        builder.addAction(android.R.drawable.ic_media_next, "Next", actionIntent(ACTION_NEXT, 13));

        builder.setStyle(new Notification.MediaStyle()
            .setMediaSession(mediaSession.getSessionToken())
            .setShowActionsInCompactView(0, 1, 2));

        return builder.build();
    }

    private void shutdown() {
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
            mediaSession = null;
        }
        stopForeground(true);
        foregroundStarted = false;
        stopSelf();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // The WebView is torn down with the task, so audio cannot continue;
        // clear the session rather than leave a phantom notification.
        shutdown();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
            mediaSession = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
