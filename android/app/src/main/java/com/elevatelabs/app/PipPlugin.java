package com.elevatelabs.app;

import android.app.PictureInPictureParams;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Rational;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.tasks.Task;

@CapacitorPlugin(name = "PipBridge")
public class PipPlugin extends Plugin {
    public static PipPlugin instance;

    @Override
    public void load() {
        super.load();
        instance = this;
    }

    public static void sendNativeBackEvent() {
        if (instance != null) {
            instance.notifyListeners("onNativeBack", new JSObject());
        }
    }

    @PluginMethod
    public void isPipSupported(PluginCall call) {
        JSObject ret = new JSObject();
        boolean supported = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && getActivity() != null) {
            supported = getActivity().getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
        }
        ret.put("supported", supported);
        call.resolve(ret);
    }

    @PluginMethod
    public void enterPip(PluginCall call) {
        if (getActivity() == null) {
            call.reject("Activity not available");
            return;
        }

        getActivity().runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                try {
                    // Source rect hint for smooth transition from mini player to PiP window
                    android.graphics.Rect sourceRect = null;
                    JSObject bounds = call.getObject("bounds");
                    if (bounds != null) {
                        try {
                            float density = getActivity().getResources().getDisplayMetrics().density;
                            int x = (int) (bounds.optDouble("x", 0) * density);
                            int y = (int) (bounds.optDouble("y", 0) * density);
                            int width = (int) (bounds.optDouble("width", 0) * density);
                            int height = (int) (bounds.optDouble("height", 0) * density);
                            if (width > 0 && height > 0) {
                                sourceRect = new android.graphics.Rect(x, y, x + width, y + height);
                            }
                        } catch (Exception ignored) {}
                    }

                    boolean success = false;
                    if (getActivity() instanceof MainActivity) {
                        PictureInPictureParams params = ((MainActivity) getActivity()).buildPipParams(sourceRect);
                        if (params != null) {
                            success = getActivity().enterPictureInPictureMode(params);
                        }
                    } else {
                        PictureInPictureParams.Builder builder = new PictureInPictureParams.Builder();
                        builder.setAspectRatio(new Rational(16, 9));
                        if (sourceRect != null) {
                            builder.setSourceRectHint(sourceRect);
                        }
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                            builder.setAutoEnterEnabled(true);
                        }
                        success = getActivity().enterPictureInPictureMode(builder.build());
                    }
                    JSObject ret = new JSObject();
                    ret.put("success", success);
                    call.resolve(ret);
                } catch (Exception e) {
                    call.reject("Failed to enter PiP: " + e.getMessage());
                }
            } else {
                call.reject("Picture-in-Picture requires Android 8.0 or higher");
            }
        });
    }

    @PluginMethod
    public void exitApp(PluginCall call) {
        if (getActivity() != null) {
            getActivity().runOnUiThread(() -> {
                getActivity().finishAffinity();
                call.resolve();
            });
        } else {
            call.resolve();
        }
    }

    @PluginMethod
    public void getStatusBarHeight(PluginCall call) {
        JSObject ret = new JSObject();
        int heightDp = 0;
        if (getActivity() != null) {
            int resourceId = getActivity().getResources().getIdentifier("status_bar_height", "dimen", "android");
            int heightPx = 0;
            if (resourceId > 0) {
                heightPx = getActivity().getResources().getDimensionPixelSize(resourceId);
            }
            if (heightPx == 0 && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                android.view.WindowInsets insets = getActivity().getWindowManager().getCurrentWindowMetrics().getWindowInsets();
                heightPx = insets.getInsets(android.view.WindowInsets.Type.statusBars()).top;
            }
            float density = getActivity().getResources().getDisplayMetrics().density;
            heightDp = Math.round(heightPx / density);
        }
        ret.put("heightDp", heightDp);
        call.resolve(ret);
    }

    @PluginMethod
    public void setPlaybackState(PluginCall call) {
        Boolean isPlaying = call.getBoolean("isPlaying", false);
        MainActivity.isVideoPlaying = Boolean.TRUE.equals(isPlaying);
        if (getActivity() instanceof MainActivity) {
            ((MainActivity) getActivity()).updatePictureInPictureActions();
        }
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void nativeGoogleSignOut(PluginCall call) {
        if (getActivity() == null) {
            call.resolve();
            return;
        }

        String serverClientId = call.getString("serverClientId", "649642031919-tmtgoi10dbdq6jka2662pqdrnkdkpp9s.apps.googleusercontent.com");
        getActivity().runOnUiThread(() -> {
            try {
                GoogleSignInOptions gso = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                    .requestEmail()
                    .requestProfile()
                    .requestIdToken(serverClientId)
                    .build();

                GoogleSignInClient client = GoogleSignIn.getClient(getActivity(), gso);
                client.signOut().addOnCompleteListener(signOutTask -> {
                    android.util.Log.i("PipPlugin", "Native Google signOut completed, success=" + signOutTask.isSuccessful());
                    try {
                        client.revokeAccess().addOnCompleteListener(revokeTask -> {
                            android.util.Log.i("PipPlugin", "Native Google revokeAccess completed, success=" + revokeTask.isSuccessful());
                            JSObject ret = new JSObject();
                            ret.put("success", true);
                            call.resolve(ret);
                        });
                    } catch (Exception ignored) {
                        JSObject ret = new JSObject();
                        ret.put("success", true);
                        call.resolve(ret);
                    }
                });
            } catch (Exception e) {
                android.util.Log.w("PipPlugin", "Native Google Sign-Out error: " + e.getMessage());
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("error", e.getMessage());
                call.resolve(ret);
            }
        });
    }

    @PluginMethod
    public void nativeGoogleSignIn(PluginCall call) {
        if (getActivity() == null) {
            call.reject("Activity not available");
            return;
        }

        String serverClientId = call.getString("serverClientId", "649642031919-tmtgoi10dbdq6jka2662pqdrnkdkpp9s.apps.googleusercontent.com");
        getActivity().runOnUiThread(() -> {
            try {
                GoogleSignInOptions gso = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                    .requestEmail()
                    .requestProfile()
                    .requestIdToken(serverClientId)
                    .build();

                GoogleSignInClient client = GoogleSignIn.getClient(getActivity(), gso);
                // Ensure client is signed out so the account chooser dialog is always presented
                client.signOut().addOnCompleteListener(signOutTask -> {
                    android.util.Log.i("PipPlugin", "Pre-sign-in signOut completed, success=" + signOutTask.isSuccessful());
                    Intent signInIntent = client.getSignInIntent();
                    startActivityForResult(call, signInIntent, "handleGoogleSignInResult");
                });
            } catch (Exception e) {
                android.util.Log.e("PipPlugin", "Google Sign-In initialization failed: " + e.getMessage(), e);
                call.reject("Google Sign-In initialization failed: " + e.getMessage());
            }
        });
    }

    @ActivityCallback
    private void handleGoogleSignInResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result == null || result.getData() == null) {
            call.reject("Google Sign-In cancelled");
            return;
        }

        Task<GoogleSignInAccount> task = GoogleSignIn.getSignedInAccountFromIntent(result.getData());
        try {
            GoogleSignInAccount account = task.getResult(ApiException.class);
            if (account != null) {
                android.util.Log.i("PipPlugin", "Google Sign-In succeeded for " + account.getEmail() + ", idToken present: " + (account.getIdToken() != null));
                JSObject ret = new JSObject();
                ret.put("idToken", account.getIdToken());
                ret.put("serverAuthCode", account.getServerAuthCode());
                ret.put("email", account.getEmail());
                ret.put("displayName", account.getDisplayName());
                ret.put("photoUrl", account.getPhotoUrl() != null ? account.getPhotoUrl().toString() : null);
                call.resolve(ret);
            } else {
                call.reject("Account is null");
            }
        } catch (ApiException e) {
            android.util.Log.e("PipPlugin", "Google Sign-In failed with status code " + e.getStatusCode(), e);
            call.reject("Google Sign-In error (" + e.getStatusCode() + "): " + e.getMessage(), String.valueOf(e.getStatusCode()));
        }
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        JSObject ret = new JSObject();
        if (getActivity() == null) {
            ret.put("granted", false);
            call.resolve(ret);
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (getActivity().checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                getActivity().requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 101);
                ret.put("granted", false);
                ret.put("requested", true);
            } else {
                ret.put("granted", true);
            }
        } else {
            boolean enabled = NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
            ret.put("granted", enabled);
        }
        call.resolve(ret);
    }

    private android.graphics.Bitmap getBitmapFromDrawable(android.graphics.drawable.Drawable drawable) {
        if (drawable == null) return null;
        if (drawable instanceof android.graphics.drawable.BitmapDrawable) {
            return ((android.graphics.drawable.BitmapDrawable) drawable).getBitmap();
        }
        int width = drawable.getIntrinsicWidth() > 0 ? drawable.getIntrinsicWidth() : 128;
        int height = drawable.getIntrinsicHeight() > 0 ? drawable.getIntrinsicHeight() : 128;
        android.graphics.Bitmap bitmap = android.graphics.Bitmap.createBitmap(width, height, android.graphics.Bitmap.Config.ARGB_8888);
        android.graphics.Canvas canvas = new android.graphics.Canvas(bitmap);
        drawable.setBounds(0, 0, canvas.getWidth(), canvas.getHeight());
        drawable.draw(canvas);
        return bitmap;
    }

    @PluginMethod
    public void showNativeNotification(PluginCall call) {
        String title = call.getString("title", "Elevate Update");
        String body = call.getString("body", "");
        int notifId = call.getInt("id", (int) System.currentTimeMillis());

        Context context = getContext();
        if (context == null) {
            call.reject("Context is null");
            return;
        }

        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        String channelId = "elevate_updates_channel";

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                channelId,
                "Elevate Updates",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Academic curriculum updates, new lectures, and mock tests");
            channel.enableVibration(true);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }

        Intent intent = new Intent(context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            notifId,
            intent,
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE : PendingIntent.FLAG_UPDATE_CURRENT
        );

        int smallIconRes = context.getResources().getIdentifier("ic_notification", "drawable", context.getPackageName());
        if (smallIconRes == 0) {
            smallIconRes = android.R.drawable.ic_popup_reminder;
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channelId)
            .setSmallIcon(smallIconRes)
            .setColor(0xFF0B57D0)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent);

        if (manager != null) {
            manager.notify(notifId, builder.build());
        }

        JSObject res = new JSObject();
        res.put("success", true);
        call.resolve(res);
    }

    @PluginMethod
    public void setNativeTheme(PluginCall call) {
        String theme = call.getString("theme", "light");
        Context context = getContext();
        if (context != null) {
            android.content.SharedPreferences prefs = context.getSharedPreferences("ElevateAppPrefs", Context.MODE_PRIVATE);
            prefs.edit().putString("app_theme", theme).apply();
            
            if (getActivity() != null) {
                getActivity().runOnUiThread(() -> {
                    MainActivity.applyAppNightMode(context, theme);
                });
            }
        }
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }
}
