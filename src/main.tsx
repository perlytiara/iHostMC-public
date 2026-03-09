import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import "./lib/i18n";
import App from "./App";
import "./styles/globals.css";
import { LoadingScreen } from "./components/LoadingScreen";

const root = ReactDOM.createRoot(document.getElementById("root")!);

// Render immediately so the app never blocks on i18n or any promise (i18n has useSuspense: false)
root.render(
  <React.StrictMode>
    <Suspense fallback={<LoadingScreen />}>
      <App />
    </Suspense>
  </React.StrictMode>
);
