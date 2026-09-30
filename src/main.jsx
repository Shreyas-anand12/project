import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import PublicReport from "./PublicReport";
import "./styles.css";

const isPublicReport = window.location.pathname === "/report";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isPublicReport ? <PublicReport /> : <App />}
  </React.StrictMode>
);