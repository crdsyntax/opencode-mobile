import { useEffect, useState } from "react";
import { Keyboard } from "react-native";

/**
 * Height of the on-screen keyboard in pixels, or 0 while it is closed.
 *
 * Android runs edge to edge, so the window is no longer resized by the IME and
 * `KeyboardAvoidingView` reports no movement on its own. Reading the keyboard
 * height directly and padding by it is what actually lifts the composer above
 * the keyboard on Android; iOS keeps using `KeyboardAvoidingView` instead.
 */
export function useKeyboardHeight() {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    // `keyboardWillShow` only fires on iOS, so both platforms are covered by subscribing to both.
    const show = Keyboard.addListener("keyboardDidShow", (event) => setHeight(event.endCoordinates.height));
    const hide = Keyboard.addListener("keyboardDidHide", () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}
