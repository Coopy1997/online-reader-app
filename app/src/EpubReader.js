import React, { useEffect, useRef, useState } from "react"
import ePub from "epubjs"
import {
  fetchProgress,
  fetchProtectedBookBuffer,
  saveProgress
} from "./api"

export default function EpubReader({
  bookId,
  bookTitle,
  bookAuthor,
  isFullscreen,
  settings
}) {
  const viewerRef = useRef(null)
  const bookRef = useRef(null)
  const renditionRef = useRef(null)
  const locationsReadyRef = useRef(false)

  const [loading, setLoading] = useState(true)
  const [toc, setToc] = useState([])
  const [showToc, setShowToc] = useState(true)
  const [currentLocation, setCurrentLocation] = useState("")
  const [progressPercent, setProgressPercent] = useState(0)

  useEffect(() => {
    let isMounted = true

    async function initReader() {
      try {
        setLoading(true)
        const arrayBuffer = await fetchProtectedBookBuffer(bookId)

        const book = ePub(arrayBuffer)
        bookRef.current = book

        const rendition = book.renderTo(viewerRef.current, {
          width: "100%",
          height: "100%",
          spread: "none"
        })

        renditionRef.current = rendition

        await book.ready
        await book.locations.generate(1000)
        locationsReadyRef.current = true

        const navigation = book.navigation?.toc || []
        if (isMounted) {
          setToc(navigation)
        }

        const saved = await fetchProgress(bookId)

        if (saved?.ProgressValue && (saved.Format || saved.format) === "epub") {
          await rendition.display(saved.ProgressValue)
        } else {
          await rendition.display()
        }

        rendition.on("relocated", async (location) => {
          const cfi = location?.start?.cfi || ""
          setCurrentLocation(cfi)

          if (locationsReadyRef.current && cfi) {
            const percentage = book.locations.percentageFromCfi(cfi) * 100
            setProgressPercent(percentage)

            try {
              await saveProgress(bookId, {
                format: "epub",
                progressValue: cfi,
                percentage
              })
            } catch (error) {
              console.error("Failed to save EPUB progress:", error)
            }
          }
        })

        if (isMounted) {
          setLoading(false)
        }
      } catch (error) {
        console.error("EPUB init failed:", error)
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    initReader()

    return () => {
      isMounted = false

      if (renditionRef.current) {
        renditionRef.current.destroy()
        renditionRef.current = null
      }

      if (bookRef.current) {
        bookRef.current.destroy()
        bookRef.current = null
      }
    }
  }, [bookId])

  useEffect(() => {
    if (!renditionRef.current) return

    const themeMap = {
      paper: {
        background: "#f8f5ef",
        color: "#1b1b1b",
        link: "#8b0000"
      },
      light: {
        background: "#ffffff",
        color: "#171717",
        link: "#b20710"
      },
      sepia: {
        background: "#f1e7d3",
        color: "#2b2117",
        link: "#9f2b11"
      }
    }

    const activeTheme = themeMap[settings?.epubTheme] || themeMap.paper
    const fontSize = settings?.epubFontSize || 100
    const lineHeight = settings?.epubLineHeight || 1.7

    renditionRef.current.themes.default({
      body: {
        background: `${activeTheme.background} !important`,
        color: `${activeTheme.color} !important`,
        "font-family": "Georgia, serif !important",
        "font-size": `${fontSize}% !important`,
        "line-height": `${lineHeight} !important`
      },
      p: {
        color: `${activeTheme.color} !important`,
        "line-height": `${lineHeight} !important`
      },
      div: {
        color: `${activeTheme.color} !important`
      },
      span: {
        color: `${activeTheme.color} !important`
      },
      h1: {
        color: `${activeTheme.color} !important`
      },
      h2: {
        color: `${activeTheme.color} !important`
      },
      h3: {
        color: `${activeTheme.color} !important`
      },
      a: {
        color: `${activeTheme.link} !important`
      }
    })

    renditionRef.current.themes.fontSize(`${fontSize}%`)
  }, [settings])

  useEffect(() => {
    const onKeyDown = (e) => {
      if (!renditionRef.current) return

      if (e.key === "ArrowRight") {
        e.preventDefault()
        renditionRef.current.next()
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault()
        renditionRef.current.prev()
      }

      if (e.key === "Escape" && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {})
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  useEffect(() => {
    if (!renditionRef.current) return

    const resizeFrame = window.requestAnimationFrame(() => {
      try {
        renditionRef.current.resize()
      } catch (error) {
        console.error("Failed to resize EPUB rendition:", error)
      }
    })

    return () => {
      window.cancelAnimationFrame(resizeFrame)
    }
  }, [showToc, isFullscreen])

  const goNext = () => {
    if (renditionRef.current) {
      renditionRef.current.next()
    }
  }

  const goPrev = () => {
    if (renditionRef.current) {
      renditionRef.current.prev()
    }
  }

  const openTocItem = (href) => {
    if (renditionRef.current && href) {
      renditionRef.current.display(href)
    }
  }

  return (
    <div className={`epub-reader-shell ${isFullscreen ? "epub-reader-shell-fullscreen" : ""}`}>
      <div className="reader-controls reader-controls-top epub-toolbar">
        <div className="epub-toolbar-left">
          <button className="secondary-btn" onClick={() => setShowToc((prev) => !prev)}>
            {showToc ? "Hide Contents" : "Show Contents"}
          </button>

          <button className="secondary-btn" onClick={goPrev}>
            Previous
          </button>

          <button className="secondary-btn" onClick={goNext}>
            Next
          </button>
        </div>

        <div className="epub-toolbar-center">
          <div className="reader-book-mini">
            <strong>{bookTitle}</strong>
            <span>{bookAuthor || "Unknown"}</span>
          </div>
        </div>

        <div className="epub-toolbar-right">
          <div className="progress-text">{progressPercent.toFixed(1)}% read</div>
        </div>
      </div>

      <div className={`epub-layout ${showToc ? "" : "epub-layout-wide"}`}>
        {showToc && (
          <aside className="epub-sidebar">
            <div className="epub-sidebar-title">Contents</div>

            {toc.length === 0 ? (
              <div className="epub-sidebar-empty">No table of contents available.</div>
            ) : (
              <div className="epub-toc-list">
                {toc.map((item, index) => (
                  <button
                    key={`${item.href}-${index}`}
                    className="epub-toc-item"
                    onClick={() => openTocItem(item.href)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </aside>
        )}

        <div className="epub-viewer-wrap">
          {loading && (
            <div className="reader-loading-overlay">
              <div className="reader-spinner" />
              <p>Loading EPUB...</p>
            </div>
          )}

          <div ref={viewerRef} className="epub-viewer" />
        </div>
      </div>

      {!!currentLocation && (
        <div className="epub-location-bar">
          Current location saved
        </div>
      )}
    </div>
  )
}
