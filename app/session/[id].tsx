import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MessageRow } from "@/components/MessageRow";
import { DevicePicker } from "@/components/DevicePicker";
import { useConnection } from "@/connection";
import { Message } from "@/api";
import { theme } from "@/theme";

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { client } = useConnection();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<readonly Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const reload = useCallback(async () => {
    if (!client || !id) return;
    try {
      setMessages(await client.messages(id));
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar los mensajes");
    } finally {
      setLoading(false);
    }
  }, [client, id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!client || !id) return;
    const controller = new AbortController();
    void client
      .subscribeSession(id, controller.signal, () => {
        // Durable frames are coalesced into a single reload so a long turn does not thrash the UI.
        if (pending.current) clearTimeout(pending.current)
        pending.current = setTimeout(() => void reload(), 120)
      })
      .catch(() => undefined)
    return () => {
      controller.abort()
      if (pending.current) clearTimeout(pending.current)
    }
  }, [client, id, reload])

  const send = async () => {
    const text = input.trim()
    if (!text || !client || !id || busy) return
    setInput("")
    setBusy(true)
    try {
      await client.prompt(id, text)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo enviar el mensaje")
      setBusy(false)
      return
    }
    void reload()
  }

  const interrupt = async () => {
    if (!client || !id) return
    try {
      await client.interrupt(id)
    } finally {
      setBusy(false)
      void reload()
    }
  }

  return (
    <View style={[styles.flex, { paddingBottom: insets.bottom }]}>
      <Stack.Screen
        options={{
          title: "Chat",
          headerRight: () =>
            id ? (
              <TouchableOpacity onPress={() => setPickerOpen(true)} hitSlop={12}>
                <Ionicons name="share-outline" size={21} color={theme.text} />
              </TouchableOpacity>
            ) : null,
        }}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={messages.slice().reverse()}
          inverted
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <MessageRow message={item} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.empty}>Envia un mensaje para empezar.</Text>
            </View>
          }
        />
      )}

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Mensaje"
            placeholderTextColor={theme.textMuted}
            multiline
          />
          {busy ? (
            <TouchableOpacity style={[styles.send, styles.stop]} onPress={interrupt}>
              <Ionicons name="stop" size={20} color={theme.onPrimary} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.send, !input.trim() && styles.sendDisabled]}
              onPress={send}
              disabled={!input.trim()}
            >
              <Ionicons name="arrow-up" size={20} color={theme.onPrimary} />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>

      {id ? <DevicePicker visible={pickerOpen} sessionID={id} onClose={() => setPickerOpen(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  list: { paddingVertical: 12, paddingTop: 24 },
  empty: { color: theme.textMuted, fontSize: 14 },
  error: { color: theme.danger, fontSize: 12, paddingHorizontal: 16, paddingVertical: 6 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    backgroundColor: theme.surface,
  },
  input: {
    flex: 1,
    maxHeight: 140,
    minHeight: 44,
    backgroundColor: theme.surfaceAlt,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: theme.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: theme.border,
  },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.primary, alignItems: "center", justifyContent: "center" },
  sendDisabled: { opacity: 0.4 },
  stop: { backgroundColor: theme.danger },
});
