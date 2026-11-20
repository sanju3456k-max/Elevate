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
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    public static boolean isVideoPlaying = false;
    public static final String ACTION_PIP_PLAY_PAUSE = "com.elevatelabs.app.ACTION_PIP_PLAY_PAUSE";

    private BroadcastReceiver pipActionReceiver;

    @Override
    public void onCreate(Bundle savedInstanceState) {
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

        boolean isDebug = (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0;

        // 1. Enterprise Screen Protection: Prevent screenshots and video recording in release builds
        if (!isDebug) {
            getWindow().setFlags(
                WindowManager.LayoutParams.FLAG_SECURE,
                WindowManager.LayoutParams.FLAG_SECURE
            );
        }

        // 2. DevTools Security Kill-Switch: Disallow Chrome inspect/debugging only on release builds
        try {
            WebView.setWebContentsDebuggingEnabled(isDebug);
        } catch (Exception ignored) {}

        // 3. Dynamic Device Insets Provider: Pass exact native status bar height and display cutout (notch) insets to WebView CSS
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                getWindow().getAttributes().layoutInDisplayCutoutMode = 
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            }

            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().setBackgroundColor(android.graphics.Color.TRANSPARENT);
            }
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
    public void onDestroy() {
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
