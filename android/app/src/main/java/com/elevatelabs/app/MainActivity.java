package com.elevatelabs.app;

import android.app.PendingIntent;
import android.app.PictureInPictureParams;
import android.app.RemoteAction;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.res.Configuration;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.os.Bundle;
import android.util.Rational;
import android.view.DisplayCutout;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.view.DisplayCutoutCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import android.os.Handler;
import android.os.Looper;
import java.net.NetworkInterface;
import java.util.Enumeration;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    public static boolean isVideoPlaying = false;
    public static final String ACTION_PIP_PLAY_PAUSE = "com.elevatelabs.app.ACTION_PIP_PLAY_PAUSE";

    private BroadcastReceiver pipActionReceiver;
    private Handler securityHandler;
    private Runnable securityCheckRunnable;

    public static void applyAppNightMode(Context context, String theme) {
        if (context == null) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                android.app.UiModeManager uiModeManager = (android.app.UiModeManager) context.getSystemService(Context.UI_MODE_SERVICE);
                if (uiModeManager != null) {
                    if ("dark".equals(theme)) {
                        uiModeManager.setApplicationNightMode(android.app.UiModeManager.MODE_NIGHT_YES);
                    } else if ("light".equals(theme)) {
                        uiModeManager.setApplicationNightMode(android.app.UiModeManager.MODE_NIGHT_NO);
                    } else {
                        uiModeManager.setApplicationNightMode(android.app.UiModeManager.MODE_NIGHT_AUTO);
                    }
                }
            }
        } catch (Exception ignored) {}
        try {
            if ("dark".equals(theme)) {
                androidx.appcompat.app.AppCompatDelegate.setDefaultNightMode(androidx.appcompat.app.AppCompatDelegate.MODE_NIGHT_YES);
            } else if ("light".equals(theme)) {
                androidx.appcompat.app.AppCompatDelegate.setDefaultNightMode(androidx.appcompat.app.AppCompatDelegate.MODE_NIGHT_NO);
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Read app's stored theme condition (light vs dark) before installing splash
        android.content.SharedPreferences prefs = getSharedPreferences("ElevateAppPrefs", MODE_PRIVATE);
        String appTheme = prefs.getString("app_theme", "light");
        applyAppNightMode(this, appTheme);

        androidx.core.splashscreen.SplashScreen.installSplashScreen(this);
        registerPlugin(PipPlugin.class);
        super.onCreate(savedInstanceState);

        // Predictive back & hardware back key bridge: guarantees 1-to-1 event delivery to webview
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                android.util.Log.i("MainActivity", "Predictive back callback triggered");
                dispatchNativeBackEvent();
            }
        });

        // Interactive Picture-in-Picture Play/Pause action receiver
        pipActionReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (intent == null || !ACTION_PIP_PLAY_PAUSE.equals(intent.getAction())) {
                    return;
                }
                android.util.Log.i("MainActivity", "PiP play/pause action clicked. Current isVideoPlaying=" + isVideoPlaying);
                isVideoPlaying = !isVideoPlaying;
                updatePictureInPictureActions();
                dispatchPipTogglePlayPause();
            }
        };

        IntentFilter filter = new IntentFilter(ACTION_PIP_PLAY_PAUSE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(pipActionReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(pipActionReceiver, filter);
        }

        // 1. Enterprise Screen Protection: Prevent screenshots, screen recording, and recents thumbnail leaks
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );

        // 2. DevTools & Sniffer Kill-Switch: Strictly disallow Chrome inspect/debugging in all builds to prevent HTTP Toolkit / DevTools hooking
        try {
            WebView.setWebContentsDebuggingEnabled(false);
        } catch (Exception ignored) {}

        // 3. Dynamic Device Insets Provider: Pass exact native status bar height and display cutout (notch) insets to WebView CSS
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                getWindow().getAttributes().layoutInDisplayCutoutMode = 
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            }

            if (getBridge() != null && getBridge().getWebView() != null) {
                WebView webView = getBridge().getWebView();
                webView.setBackgroundColor(android.graphics.Color.TRANSPARENT);

                // 1. Force hardware-accelerated layer for 60-120 FPS rendering
                webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

                // 2. High priority rendering thread (Android 8.0+ / Oreo+)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    try {
                        webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
                    } catch (Exception ignored) {}
                }

                // 3. Hardware acceleration & performance settings
                try {
                    android.webkit.WebSettings settings = webView.getSettings();
                    settings.setMediaPlaybackRequiresUserGesture(false);
                    settings.setDomStorageEnabled(true);
                    settings.setDatabaseEnabled(true);
                    settings.setCacheMode(android.webkit.WebSettings.LOAD_DEFAULT);

                    // Render offscreen DOM beforehand for stutter-free scrolling if supported
                    try {
                        settings.getClass().getMethod("setOffscreenPreRaster", boolean.class).invoke(settings, true);
                    } catch (Throwable ignored) {}
                } catch (Exception ignored) {}
            }

            // Proactively verify & request essential permissions (Microphone, Camera, Images)
            checkAndRequestAppPermissions();
            View decorView = getWindow().getDecorView();
            ViewCompat.setOnApplyWindowInsetsListener(decorView, (v, windowInsets) -> {
                int statusBarHeightPx = windowInsets.getInsets(WindowInsetsCompat.Type.statusBars()).top;
                float density = getResources().getDisplayMetrics().density;
                int statusBarHeightDp = Math.round(statusBarHeightPx / density);

                int cutoutLeftDp = 0;
                int cutoutRightDp = 0;
                int cutoutTopDp = 0;
                int cutoutBottomDp = 0;

                DisplayCutoutCompat compatCutout = windowInsets.getDisplayCutout();
                if (compatCutout != null) {
                    cutoutLeftDp = Math.round(compatCutout.getSafeInsetLeft() / density);
                    cutoutRightDp = Math.round(compatCutout.getSafeInsetRight() / density);
                    cutoutTopDp = Math.round(compatCutout.getSafeInsetTop() / density);
                    cutoutBottomDp = Math.round(compatCutout.getSafeInsetBottom() / density);
                } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    WindowInsets rootInsets = v.getRootWindowInsets();
                    if (rootInsets != null) {
                        DisplayCutout cutout = rootInsets.getDisplayCutout();
                        if (cutout != null) {
                            cutoutLeftDp = Math.round(cutout.getSafeInsetLeft() / density);
                            cutoutRightDp = Math.round(cutout.getSafeInsetRight() / density);
                            cutoutTopDp = Math.round(cutout.getSafeInsetTop() / density);
                            cutoutBottomDp = Math.round(cutout.getSafeInsetBottom() / density);
                        }
                    }
                }

                final String js = String.format(
                    "document.documentElement.style.setProperty('--android-status-bar-height', '%dpx');" +
                    "document.documentElement.style.setProperty('--android-cutout-left', '%dpx');" +
                    "document.documentElement.style.setProperty('--android-cutout-right', '%dpx');" +
                    "document.documentElement.style.setProperty('--android-cutout-top', '%dpx');" +
                    "document.documentElement.style.setProperty('--android-cutout-bottom', '%dpx');",
                    statusBarHeightDp, cutoutLeftDp, cutoutRightDp, cutoutTopDp, cutoutBottomDp
                );

                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().post(() -> {
                        getBridge().getWebView().evaluateJavascript(js, null);
                    });
                }
                return ViewCompat.onApplyWindowInsets(v, windowInsets);
            });
        } catch (Exception ignored) {}
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        try {
            View decorView = getWindow().getDecorView();
            decorView.post(() -> {
                ViewCompat.requestApplyInsets(decorView);
            });
        } catch (Exception ignored) {}
    }

    @Override
    public void onResume() {
        super.onResume();
        startNetworkSecurityMonitoring();
    }

    @Override
    public void onPause() {
        super.onPause();
        stopNetworkSecurityMonitoring();
    }

    private void startNetworkSecurityMonitoring() {
        if (securityHandler == null) {
            securityHandler = new Handler(Looper.getMainLooper());
        }
        if (securityCheckRunnable == null) {
            securityCheckRunnable = new Runnable() {
                @Override
                public void run() {
                    checkNetworkSecurityViolations();
                    if (securityHandler != null) {
                        securityHandler.postDelayed(this, 3500);
                    }
                }
            };
        }
        securityHandler.removeCallbacks(securityCheckRunnable);
        securityHandler.post(securityCheckRunnable);
    }

    private void stopNetworkSecurityMonitoring() {
        if (securityHandler != null && securityCheckRunnable != null) {
            securityHandler.removeCallbacks(securityCheckRunnable);
        }
    }

    public boolean isProxyOrVpnActive() {
        try {
            // 1. Check system HTTP and HTTPS proxy properties
            String proxyHost = System.getProperty("http.proxyHost");
            String proxyPort = System.getProperty("http.proxyPort");
            if (proxyHost != null && !proxyHost.isEmpty() && !"0".equals(proxyPort)) {
                return true;
            }
            String httpsProxyHost = System.getProperty("https.proxyHost");
            String httpsProxyPort = System.getProperty("https.proxyPort");
            if (httpsProxyHost != null && !httpsProxyHost.isEmpty() && !"0".equals(httpsProxyPort)) {
                return true;
            }

            // 2. Check ConnectivityManager active network capabilities and default proxy
            android.net.ConnectivityManager cm = (android.net.ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    android.net.Network activeNetwork = cm.getActiveNetwork();
                    if (activeNetwork != null) {
                        android.net.NetworkCapabilities caps = cm.getNetworkCapabilities(activeNetwork);
                        if (caps != null) {
                            if (caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_VPN) ||
                                !caps.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_NOT_VPN)) {
                                return true;
                            }
                        }
                    }
                }
                android.net.ProxyInfo proxyInfo = cm.getDefaultProxy();
                if (proxyInfo != null && proxyInfo.getHost() != null && !proxyInfo.getHost().isEmpty()) {
                    return true;
                }
            }

            // 3. Check NetworkInterface for tun/tap/ppp interfaces (used by HTTP Toolkit, Charles, Packet Capture)
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces != null && interfaces.hasMoreElements()) {
                NetworkInterface intf = interfaces.nextElement();
                if (intf.isUp()) {
                    String name = intf.getName().toLowerCase();
                    if (name.contains("tun") || name.contains("tap") || name.contains("ppp") || name.contains("p2p")) {
                        return true;
                    }
                }
            }
        } catch (Exception ignored) {}
        return false;
    }

    private void checkNetworkSecurityViolations() {
        boolean violation = isProxyOrVpnActive();
        if (getBridge() != null && getBridge().getWebView() != null) {
            final String js = String.format(
                "(function() {" +
                "  window.__ELEVATE_NETWORK_SECURITY = { isProxyOrVpnActive: %b };" +
                "  window.dispatchEvent(new CustomEvent('elevate_security_status', { detail: { isProxyOrVpnActive: %b } }));" +
                "})();",
                violation, violation
            );
            getBridge().getWebView().post(() -> {
                getBridge().getWebView().evaluateJavascript(js, null);
            });
        }
    }

    private void checkAndRequestAppPermissions() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
        List<String> needed = new ArrayList<>();
        if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            needed.add(android.Manifest.permission.RECORD_AUDIO);
        }
        if (checkSelfPermission(android.Manifest.permission.MODIFY_AUDIO_SETTINGS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            needed.add(android.Manifest.permission.MODIFY_AUDIO_SETTINGS);
        }
        if (checkSelfPermission(android.Manifest.permission.CAMERA) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            needed.add(android.Manifest.permission.CAMERA);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(android.Manifest.permission.READ_MEDIA_IMAGES) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                needed.add(android.Manifest.permission.READ_MEDIA_IMAGES);
            }
            if (checkSelfPermission(android.Manifest.permission.READ_MEDIA_VIDEO) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                needed.add(android.Manifest.permission.READ_MEDIA_VIDEO);
            }
        } else {
            if (checkSelfPermission(android.Manifest.permission.READ_EXTERNAL_STORAGE) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                needed.add(android.Manifest.permission.READ_EXTERNAL_STORAGE);
            }
        }
        if (!needed.isEmpty()) {
            requestPermissions(needed.toArray(new String[0]), 1002);
        }
    }

    @Override
    public void onDestroy() {
        stopNetworkSecurityMonitoring();
        securityHandler = null;
        securityCheckRunnable = null;
        if (pipActionReceiver != null) {
            try {
                unregisterReceiver(pipActionReceiver);
            } catch (Exception ignored) {}
            pipActionReceiver = null;
        }
        super.onDestroy();
    }

    @Override
    public boolean onKeyDown(int keyCode, android.view.KeyEvent event) {
        if (keyCode == android.view.KeyEvent.KEYCODE_BACK) {
            android.util.Log.i("MainActivity", "KEYCODE_BACK in onKeyDown");
            dispatchNativeBackEvent();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    private void dispatchNativeBackEvent() {
        android.util.Log.i("MainActivity", "dispatchNativeBackEvent called");
        PipPlugin.sendNativeBackEvent();
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().post(() -> {
                getBridge().getWebView().evaluateJavascript(
                    "(function() { window.dispatchEvent(new CustomEvent('nativeHardwareBack')); })()",
                    (res) -> android.util.Log.i("MainActivity", "eval result: " + res)
                );
            });
        }
    }

    /**
     * Builds PictureInPictureParams configured with 16:9 ratio and dynamic Play/Pause RemoteAction.
     */
    public PictureInPictureParams buildPipParams(android.graphics.Rect sourceRectHint) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return null;
        }
        try {
            PictureInPictureParams.Builder builder = new PictureInPictureParams.Builder();
            builder.setAspectRatio(new Rational(16, 9));
            if (sourceRectHint != null) {
                builder.setSourceRectHint(sourceRectHint);
            }

            List<RemoteAction> actions = new ArrayList<>();
            Intent actionIntent = new Intent(ACTION_PIP_PLAY_PAUSE);
            actionIntent.setPackage(getPackageName());

            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }

            PendingIntent pendingIntent = PendingIntent.getBroadcast(
                this,
                101,
                actionIntent,
                flags
            );

            int iconRes = isVideoPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play;
            String title = isVideoPlaying ? "Pause" : "Play";

            RemoteAction playPauseAction = new RemoteAction(
                Icon.createWithResource(this, iconRes),
                title,
                title,
                pendingIntent
            );
            actions.add(playPauseAction);
            builder.setActions(actions);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                builder.setAutoEnterEnabled(isVideoPlaying);
            }

            return builder.build();
        } catch (Exception e) {
            android.util.Log.w("MainActivity", "buildPipParams notice: " + e.getMessage());
            return null;
        }
    }

    /**
     * Dynamically updates the Play/Pause action button on the active PiP window.
     */
    public void updatePictureInPictureActions() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        runOnUiThread(() -> {
            try {
                PictureInPictureParams params = buildPipParams(null);
                if (params != null) {
                    setPictureInPictureParams(params);
                }
            } catch (Exception e) {
                android.util.Log.w("MainActivity", "updatePictureInPictureActions notice: " + e.getMessage());
            }
        });
    }

    private void dispatchPipTogglePlayPause() {
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().post(() -> {
                getBridge().getWebView().evaluateJavascript(
                    "(function() { window.dispatchEvent(new CustomEvent('nativePipTogglePlayPause')); })()",
                    null
                );
            });
        }
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (isVideoPlaying && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                PictureInPictureParams params = buildPipParams(null);
                if (params != null) {
                    enterPictureInPictureMode(params);
                }
            } catch (Exception ignored) {}
        }
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().post(() -> {
                    getBridge().getWebView().evaluateJavascript(
                        "window.dispatchEvent(new CustomEvent('nativePipChanged', { detail: { inPip: " + isInPictureInPictureMode + " } }));",
                        null
                    );
                });
            }
        } catch (Exception ignored) {}
    }
}
