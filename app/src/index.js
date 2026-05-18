import React from "react"
import ReactDOM from "react-dom/client"
import { Analytics } from "@vercel/analytics/react"
import "./index.css"
import App from "./App"
import reportWebVitals from "./reportWebVitals"

const RESIZE_OBSERVER_MESSAGES = new Set([
  "ResizeObserver loop completed with undelivered notifications.",
  "ResizeObserver loop limit exceeded"
])

if (typeof window !== "undefined" && "ResizeObserver" in window) {
  const NativeResizeObserver = window.ResizeObserver

  window.ResizeObserver = class ResizeObserver extends NativeResizeObserver {
    constructor(callback) {
      super((entries, observer) => {
        window.requestAnimationFrame(() => {
          callback(entries, observer)
        })
      })
    }
  }
}

const originalConsoleError = console.error

console.error = (...args) => {
  const firstMessage = typeof args[0] === "string" ? args[0] : ""

  if (RESIZE_OBSERVER_MESSAGES.has(firstMessage)) {
    return
  }

  originalConsoleError(...args)
}

window.addEventListener("error", (event) => {
  if (RESIZE_OBSERVER_MESSAGES.has(event.message)) {
    event.stopImmediatePropagation()
    event.preventDefault()
  }
}, true)

window.addEventListener("unhandledrejection", (event) => {
  const message = event.reason?.message || ""

  if (RESIZE_OBSERVER_MESSAGES.has(message)) {
    event.preventDefault()
  }
})

const root = ReactDOM.createRoot(document.getElementById("root"))

root.render(
  <React.StrictMode>
    <App />
    <Analytics />
  </React.StrictMode>
)

reportWebVitals()
