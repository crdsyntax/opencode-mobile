import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ChatItem, ChatMessage } from "@/protocol";
import { theme } from "@/theme";

function ToolRow({ item }: { item: ChatItem & { kind: "tool" } }) {
  const [open, setOpen] = useState(false);
  const color = item.status === "error" ? theme.danger : item.status === "completed" ? theme.success : theme.warning;
  return (
    <View style={styles.tool}>
      <Text style={styles.toolTitle} onPress={() => setOpen((value) => !value)} numberOfLines={1}>
        {item.title ?? item.name}
      </Text>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.toolStatus}>{item.status}</Text>
    </View>
  );
}

export function MessageRow({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <View style={[styles.bubble, styles.userBubble]}>
        <Text style={styles.role}>Tu</Text>
        <Text style={styles.text}>{message.text}</Text>
      </View>
    );
  }

  if (message.role === "system") {
    return (
      <View style={[styles.bubble, styles.systemBubble]}>
        <Text style={styles.systemText}>{message.text}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.bubble, styles.assistantBubble]}>
      <Text style={styles.role}>opencode{message.agent ? ` · ${message.agent}` : ""}</Text>
      {message.items.map((item, index) => {
        const key = `${message.id}-${index}`;
        if (item.kind === "text") return <Text key={key} style={styles.text}>{item.text}</Text>;
        if (item.kind === "reasoning") return <Text key={key} style={styles.reasoning}>{item.text}</Text>;
        return <ToolRow key={key} item={item} />;
      })}
      {message.error ? <Text style={styles.error}>{message.error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { borderRadius: 16, padding: 14, marginHorizontal: 16, marginVertical: 6, gap: 8, borderWidth: 1, borderColor: theme.border },
  userBubble: { backgroundColor: theme.user, alignSelf: "flex-end", maxWidth: "88%" },
  assistantBubble: { backgroundColor: theme.surface, alignSelf: "flex-start", maxWidth: "94%" },
  systemBubble: { backgroundColor: theme.surfaceAlt, alignSelf: "stretch" },
  role: { color: theme.textMuted, fontSize: 11, fontWeight: "700" },
  text: { color: theme.text, fontSize: 15, lineHeight: 22 },
  systemText: { color: theme.textMuted, fontSize: 13, lineHeight: 19 },
  reasoning: { color: theme.textMuted, fontSize: 13, lineHeight: 19, fontStyle: "italic" },
  tool: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: theme.surfaceAlt, borderRadius: 10, padding: 10 },
  toolTitle: { color: theme.text, fontSize: 13, fontWeight: "600", flex: 1 },
  toolStatus: { color: theme.textMuted, fontSize: 11 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  error: { color: theme.danger, fontSize: 13 },
});
