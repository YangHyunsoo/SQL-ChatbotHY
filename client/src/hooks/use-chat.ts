import { useMutation } from "@tanstack/react-query";
import { api, type SqlChatResponse } from "@shared/routes";
import { z } from "zod";

export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sql?: string;
  data?: any[];
  error?: string;
  timestamp: Date;
};

export function useChat() {
  return useMutation({
    mutationFn: async (message: string) => {
      // Input validation using schema
      const input = api.chat.sql.input.parse({ message });

      const res = await fetch(api.chat.sql.path, {
        method: api.chat.sql.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        credentials: "include", // Important for potential auth cookies
      });

      if (!res.ok) {
        if (res.status === 500) {
           const errorData = api.chat.sql.responses[500].parse(await res.json());
           throw new Error(errorData.message);
        }
        throw new Error("Failed to send message");
      }

      // Validate response using schema
      return api.chat.sql.responses[200].parse(await res.json());
    },
  });
}
