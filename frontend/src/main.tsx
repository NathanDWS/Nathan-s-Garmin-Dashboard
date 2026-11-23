import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import "leaflet/dist/leaflet.css";
import App from "./App";
import { ProfileProvider } from "./lib/profile-context";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ProfileProvider>
      <App />
    </ProfileProvider>
  </StrictMode>,
);
