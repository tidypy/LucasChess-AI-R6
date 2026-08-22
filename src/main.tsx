import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ClickLoggerProvider } from "./lib/clickLogger";
import "./App.css";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ClickLoggerProvider>
        <App />
      </ClickLoggerProvider>
    </QueryClientProvider>
  </StrictMode>,
);
