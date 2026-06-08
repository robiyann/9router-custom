import path from "path";

export default {
  test: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "open-sse": path.resolve(__dirname, "./open-sse"),
    },
    environment: "node",
  },
};
