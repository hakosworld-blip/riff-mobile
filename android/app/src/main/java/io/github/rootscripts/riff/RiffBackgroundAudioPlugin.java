package io.github.rootscripts.riff;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Keeps WebView playback alive in the background through a media foreground
 * service, and forwards lock-screen / notification transport buttons to JS.
 *
 * Audio decoding, EQ and DSP stay in the WebView; this plugin only owns the
 * native media session and the foreground service lifecycle.
 */
@CapacitorPlugin(name = "RiffBackgroundAudio")
public class RiffBackgroundAudioPlugin extends Plugin {

    private static final int NOTIFICATION_PERMISSION_REQUEST = 9137;
    private static RiffBackgroundAudioPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
        super.handleOnDestroy();
    }

    @PluginMethod
    public void enable(PluginCall call) {
        requestNotificationPermission();
        startService(RiffPlaybackService.ACTION_START, call, true);
        call.resolve();
    }

    @PluginMethod
    public void update(PluginCall call) {
        startService(RiffPlaybackService.ACTION_UPDATE, call, false);
        call.resolve();
    }

    @PluginMethod
    public void setPosition(PluginCall call) {
        Intent intent = baseIntent(RiffPlaybackService.ACTION_POSITION);
        putPosition(intent, call);
        send(intent, false);
        call.resolve();
    }

    @PluginMethod
    public void disable(PluginCall call) {
        Intent intent = new Intent(getContext(), RiffPlaybackService.class);
        intent.setAction(RiffPlaybackService.ACTION_STOP);
        try {
            getContext().startService(intent);
        } catch (Exception ignored) {
        }
        call.resolve();
    }

    private Intent baseIntent(String action) {
        Intent intent = new Intent(getContext(), RiffPlaybackService.class);
        intent.setAction(action);
        return intent;
    }

    private void putPosition(Intent intent, PluginCall call) {
        if (call.getDouble("position") != null) {
            intent.putExtra(RiffPlaybackService.EXTRA_POSITION, call.getDouble("position"));
        }
        if (call.getDouble("duration") != null) {
            intent.putExtra(RiffPlaybackService.EXTRA_DURATION, call.getDouble("duration"));
        }
        Boolean playing = call.getBoolean("playing");
        if (playing != null) {
            intent.putExtra(RiffPlaybackService.EXTRA_PLAYING, playing);
        }
    }

    private void startService(String action, PluginCall call, boolean foreground) {
        Intent intent = baseIntent(action);
        intent.putExtra(RiffPlaybackService.EXTRA_TITLE, call.getString("title", "Riff"));
        intent.putExtra(RiffPlaybackService.EXTRA_ARTIST, call.getString("artist", ""));
        intent.putExtra(RiffPlaybackService.EXTRA_ALBUM, call.getString("album", ""));
        intent.putExtra(RiffPlaybackService.EXTRA_ARTWORK, call.getString("artwork", ""));
        if (call.getDouble("duration") != null) {
            intent.putExtra(RiffPlaybackService.EXTRA_DURATION, call.getDouble("duration"));
        }
        if (call.getDouble("position") != null) {
            intent.putExtra(RiffPlaybackService.EXTRA_POSITION, call.getDouble("position"));
        }
        Boolean playing = call.getBoolean("playing");
        intent.putExtra(RiffPlaybackService.EXTRA_PLAYING, playing == null ? true : playing);
        send(intent, foreground);
    }

    private void send(Intent intent, boolean foreground) {
        try {
            if (foreground && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(intent);
            } else {
                getContext().startService(intent);
            }
        } catch (Exception e) {
            // Background start restrictions: if the service is already alive a
            // plain startService still reaches it.
            try {
                getContext().startService(intent);
            } catch (Exception ignored) {
            }
        }
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        if (getActivity() == null) return;
        if (getContext().checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return;
        getActivity().requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST);
    }

    /** Called from the service; always hops to the UI thread before touching the bridge. */
    void emitCommand(final String action, final double position) {
        if (getActivity() == null) return;
        getActivity().runOnUiThread(() -> {
            JSObject data = new JSObject();
            data.put("action", action);
            data.put("position", position);
            notifyListeners("command", data);
        });
    }

    static void command(String action) {
        command(action, 0);
    }

    static void command(String action, double position) {
        RiffBackgroundAudioPlugin plugin = instance;
        if (plugin != null) plugin.emitCommand(action, position);
    }
}
