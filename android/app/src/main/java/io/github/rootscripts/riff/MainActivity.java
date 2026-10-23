package io.github.rootscripts.riff;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RiffBackgroundAudioPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
