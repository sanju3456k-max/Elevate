package com.elevatelabs.app;

import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 1. Enterprise Screen Protection: Prevent screenshots and video recording
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );

        // 2. DevTools Security Kill-Switch: Disallow Chrome inspect/debugging on WebView
        try {
            WebView.setWebContentsDebuggingEnabled(false);
        } catch (Exception ignored) {}
    }
}
