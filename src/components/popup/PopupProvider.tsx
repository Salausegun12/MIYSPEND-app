import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { haptics } from "../../utils/haptics";
import { Dialog, DialogConfig, PopupType } from "../ui/Dialog";
import { Toast, ToastConfig } from "../ui/Toast";

const EXIT_MS = 220;
const TOAST_DURATION_MS = 3200;
const BACKDROP_COLOR = "rgba(9, 17, 14, 0.55)";

export interface AlertOptions {
  type?: PopupType;
  confirmText?: string;
  onConfirm?: () => void;
}

export interface ConfirmOptions {
  type?: PopupType;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

export interface PopupApi {
  alert: (title: string, message?: string, options?: AlertOptions) => void;
  confirm: (
    title: string,
    message?: string,
    options?: ConfirmOptions
  ) => Promise<boolean>;
  toast: (message: string, type?: PopupType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

const PopupContext = createContext<PopupApi | null>(null);

export function usePopup(): PopupApi {
  const value = useContext(PopupContext);
  if (!value) {
    throw new Error("usePopup must be used within a PopupProvider");
  }
  return value;
}

function feedbackFor(type: PopupType) {
  if (type === "success") haptics.success();
  else if (type === "error") haptics.error();
  else if (type === "warning") haptics.warning();
  else haptics.select();
}

interface PopupHostProps {
  dialog: DialogConfig | null;
  toast: ToastConfig | null;
  onDismissDialog: () => void;
  onDismissToast: () => void;
}

function PopupHost({
  dialog,
  toast,
  onDismissDialog,
  onDismissToast,
}: PopupHostProps) {
  const hasDialog = dialog !== null;
  const hasToast = toast !== null;
  const active = hasDialog || hasToast;
  const activeRef = useRef(active);
  activeRef.current = active;

  const [hostVisible, setHostVisible] = useState(false);
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (active) {
      setHostVisible(true);
      return;
    }
    const timer = setTimeout(() => {
      if (!activeRef.current) setHostVisible(false);
    }, EXIT_MS);
    return () => clearTimeout(timer);
  }, [active]);

  useEffect(() => {
    if (hasDialog) {
      backdropOpacity.setValue(0);
      const animation = Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      });
      animation.start();
      return () => animation.stop();
    }

    const animation = Animated.timing(backdropOpacity, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [hasDialog, backdropOpacity]);

  return (
    <Modal
      visible={hostVisible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => {
        if (hasDialog) onDismissDialog();
        else if (hasToast) onDismissToast();
      }}
    >
      <View style={styles.fill}>
        <Animated.View
          pointerEvents={hasDialog ? "auto" : "none"}
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: BACKDROP_COLOR, opacity: backdropOpacity },
          ]}
        >
          <Pressable
            style={styles.fill}
            onPress={onDismissDialog}
            accessibilityRole="button"
            accessibilityLabel="Dismiss dialog"
          />
        </Animated.View>

        {!hasDialog && hasToast ? (
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onDismissToast}
            accessibilityRole="button"
            accessibilityLabel="Dismiss notification"
          />
        ) : null}

        <Dialog config={dialog} visible={hasDialog} />
        <Toast config={toast} visible={hasToast} onPress={onDismissToast} />
      </View>
    </Modal>
  );
}

interface PopupProviderProps {
  children: React.ReactNode;
}

export function PopupProvider({ children }: PopupProviderProps) {
  const [dialog, setDialog] = useState<DialogConfig | null>(null);
  const [toast, setToast] = useState<ToastConfig | null>(null);
  const pendingConfirm = useRef<((value: boolean) => void) | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastId = useRef(0);

  const closeDialog = useCallback((result: boolean) => {
    setDialog(null);
    const resolve = pendingConfirm.current;
    pendingConfirm.current = null;
    resolve?.(result);
  }, []);

  const dismissToast = useCallback(() => {
    setToast(null);
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
      toastTimer.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const alert = useCallback(
    (title: string, message?: string, options?: AlertOptions) => {
      closeDialog(false);
      const type = options?.type ?? "info";
      feedbackFor(type);
      setDialog({
        title,
        message,
        type,
        buttons: [
          {
            label: options?.confirmText ?? "OK",
            variant: "primary",
            onPress: () => {
              closeDialog(true);
              options?.onConfirm?.();
            },
          },
        ],
      });
    },
    [closeDialog]
  );

  const confirm = useCallback(
    (
      title: string,
      message?: string,
      options?: ConfirmOptions
    ): Promise<boolean> => {
      closeDialog(false);
      const destructive = options?.destructive ?? false;
      const type = options?.type ?? (destructive ? "warning" : "info");
      feedbackFor(type);

      return new Promise<boolean>((resolve) => {
        pendingConfirm.current = resolve;
        setDialog({
          title,
          message,
          type,
          buttons: [
            {
              label: options?.cancelText ?? "Cancel",
              variant: "secondary",
              onPress: () => closeDialog(false),
            },
            {
              label:
                options?.confirmText ?? (destructive ? "Delete" : "Confirm"),
              variant: destructive ? "destructive" : "primary",
              onPress: () => closeDialog(true),
            },
          ],
        });
      });
    },
    [closeDialog]
  );

  const showToast = useCallback((message: string, type: PopupType = "info") => {
    toastId.current += 1;
    setToast({ id: toastId.current, message, type });
    feedbackFor(type);

    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setToast(null);
      toastTimer.current = null;
    }, TOAST_DURATION_MS);
  }, []);

  const api = useMemo<PopupApi>(
    () => ({
      alert,
      confirm,
      toast: showToast,
      success: (message: string) => showToast(message, "success"),
      error: (message: string) => showToast(message, "error"),
      warning: (message: string) => showToast(message, "warning"),
      info: (message: string) => showToast(message, "info"),
    }),
    [alert, confirm, showToast]
  );

  return (
    <PopupContext.Provider value={api}>
      {children}
      <PopupHost
        dialog={dialog}
        toast={toast}
        onDismissDialog={() => closeDialog(false)}
        onDismissToast={dismissToast}
      />
    </PopupContext.Provider>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
