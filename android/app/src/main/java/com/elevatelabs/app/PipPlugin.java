package com.elevatelabs.app;

import android.app.PictureInPictureParams;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Rational;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PipBridge")
public class PipPlugin extends Plugin {

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

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                Rational aspectRatio = new Rational(16, 9);
                PictureInPictureParams.Builder builder = new PictureInPictureParams.Builder();
                builder.setAspectRatio(aspectRatio);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    builder.setAutoEnterEnabled(true);
                }
                boolean success = getActivity().enterPictureInPictureMode(builder.build());
                JSObject ret = new JSObject();
                ret.put("success", success);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Failed to enter PiP: " + e.getMessage());
            }
        } else {
            call.reject("Picture-in-Picture requires Android 8.0 (API 26) or higher");
        }
    }

    @PluginMethod
    public void setPlaybackState(PluginCall call) {
        Boolean isPlaying = call.getBoolean("isPlaying", false);
        MainActivity.isVideoPlaying = Boolean.TRUE.equals(isPlaying);
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }
}
