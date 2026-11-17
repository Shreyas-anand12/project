import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import PublicReport from "./PublicReport";
import PublicMap from "./PublicMap";
import TrackReport from "./TrackReport";
import "./styles.css";

const path = window.location.pathname;

let Page;
if (path === "/report") {
  Page = <PublicReport />;
} else if (path === "/map") {
  Page = <PublicMap />;
} else if (path.startsWith("/track/")) {
  Page = <TrackReport />;
} else {
  Page = <App />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>{Page}</React.StrictMode>
);