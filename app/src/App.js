import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react"
import { Document, Page, pdfjs } from "react-pdf"
import "react-pdf/dist/Page/AnnotationLayer.css"
import "react-pdf/dist/Page/TextLayer.css"
import AdminPanel from "./AdminPanel"
import AuthPanel from "./AuthPanel"
import BookCover from "./BookCover"
import EpubReader from "./EpubReader"
import {
  addBookToMyList,
  clearStoredAuth,
  deleteAdminReview,
  fetchLibraryBooks,
  fetchProgress,
  followUser,
  getApiBase,
  getBookReviews,
  getCommunityFeed,
  getLeaderboard,
  getMyList,
  getMyProfile,
  getProfile,
  getStoredUser,
  getToken,
  removeBookFromMyList,
  saveBookReview,
  saveProgress,
  subscribeToUnauthorized,
  toggleHelpfulVote,
  unfollowUser,
  updateAdminReview,
  updateMyGoals,
  updateMyProfile,
  uploadMyAvatar
} from "./api"
import "./App.css"

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

const API_BASE =
  getApiBase()

const BADGE_ICON_MAP = {
  book: "📘",
  medal: "🏅",
  chat: "💬",
  bookmark: "🔖",
  flame: "🔥",
  crown: "👑",
  people: "👥",
  spark: "✨",
  staff: "🛡️",
  rocket: "🚀",
  dragon: "🐉",
  legend: "🌟",
  gem: "💎",
  lightning: "⚡",
  trophy: "🏆"
}

const TITLE_ICON_MAP = {
  "staff-sentinel": "🛡️",
  "gold-crown": "👑",
  "silver-crown": "🥈",
  "bronze-crown": "🥉",
  "rising-reader": "✨",
  "avid-reader": "📘",
  storykeeper: "🔖",
  "grand-curator": "💎",
  "master-librarian": "🌟",
  "mythic-archivist": "🐉"
}

function formatPercent(value) {
  if (value == null || Number.isNaN(Number(value))) return 0
  return Math.max(0, Math.min(100, Number(value)))
}

function formatDate(dateValue) {
  if (!dateValue) return ""
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date)
}

function formatSavedProgressLabel(progress, fileType) {
  if (!progress?.ProgressValue) {
    return "No saved position"
  }

  const progressFormat = (progress.Format || fileType || "").toLowerCase()

  if (progressFormat === "epub") {
    const percentage = formatPercent(progress.Percentage)
    return percentage > 0
      ? `Page ${Math.max(1, Math.round(percentage))}`
      : "Page saved"
  }

  const parsedPage = parseInt(progress.ProgressValue, 10)
  return Number.isNaN(parsedPage) ? "Saved position" : `Page ${parsedPage}`
}

function getReadingStatus(book) {
  const percentage = formatPercent(book.progress?.Percentage)

  if (percentage >= 100) return "Completed"
  if (percentage > 0) return "In progress"
  return "Ready to start"
}

function formatActivityMessage(activity) {
  const name = activity.DisplayName || activity.Email || "A reader"
  const bookTitle = activity.BookTitle || "a book"

  if (activity.ActivityType === "saved_to_list") {
    return `${name} added ${bookTitle} to My List`
  }

  if (activity.ActivityType === "reviewed_book") {
    const rating = activity.metadata?.rating
    return rating
      ? `${name} rated ${bookTitle} ${rating}/5`
      : `${name} reviewed ${bookTitle}`
  }

  if (activity.ActivityType === "completed_book") {
    return `${name} finished ${bookTitle}`
  }

  if (activity.ActivityType === "started_book") {
    return `${name} started ${bookTitle}`
  }

  if (activity.ActivityType === "followed_reader") {
    return `${name} followed another reader`
  }

  return `${name} had new reading activity`
}

function getBadgeIcon(icon) {
  return BADGE_ICON_MAP[icon] || "★"
}

function getProfileAvatarSrc(profile) {
  if (!profile) return ""
  if (profile.AvatarImagePath && profile.UserId) {
    return `${API_BASE}/profiles/${profile.UserId}/avatar`
  }

  return profile.AvatarUrl || ""
}

function getProfileAvatarSrcWithCache(profile) {
  const baseSrc = getProfileAvatarSrc(profile)

  if (!baseSrc) return ""

  if (profile?.AvatarImagePath && profile?.UserId) {
    const cacheToken = encodeURIComponent(
      profile.ProfileUpdatedAt || profile.AvatarImagePath || "avatar"
    )
    return `${API_BASE}/profiles/${profile.UserId}/avatar?v=${cacheToken}`
  }

  return baseSrc
}

function getUserDisplayName(profile, fallbackEmail = "") {
  return profile?.DisplayName || fallbackEmail || "Reader"
}

function formatAverageRating(value) {
  const rating = Number(value || 0)

  if (!Number.isFinite(rating) || rating <= 0) {
    return "No ratings yet"
  }

  return Number.isInteger(rating) ? `${rating}/5` : `${rating.toFixed(1)}/5`
}

function getLevelToneClass(level) {
  const numericLevel = Number(level || 0)

  if (numericLevel >= 100) return "level-tone-100"
  if (numericLevel >= 50) return "level-tone-50"
  if (numericLevel >= 25) return "level-tone-25"
  if (numericLevel >= 10) return "level-tone-10"
  return ""
}

function getPrestigeTitle(level) {
  const numericLevel = Number(level || 0)

  if (numericLevel >= 100) return "Mythic Archivist"
  if (numericLevel >= 50) return "Master Librarian"
  if (numericLevel >= 25) return "Grand Curator"
  if (numericLevel >= 10) return "Storykeeper"
  if (numericLevel >= 5) return "Avid Reader"
  return "Rising Reader"
}

function getPodiumIcon(rank) {
  if (rank === 1) return "👑"
  if (rank === 2) return "🥈"
  if (rank === 3) return "🥉"
  return ""
}

function getTitleToneClass(titleCode) {
  if (!titleCode) return ""
  if (titleCode === "staff-sentinel") return "title-tone-staff"
  if (titleCode === "gold-crown") return "title-tone-gold"
  if (titleCode === "silver-crown") return "title-tone-silver"
  if (titleCode === "bronze-crown") return "title-tone-bronze"
  if (titleCode === "mythic-archivist") return "title-tone-mythic"
  if (titleCode === "master-librarian") return "title-tone-master"
  if (titleCode === "grand-curator") return "title-tone-grand"
  return "title-tone-soft"
}

function getTitleIcon(title) {
  if (!title?.code) return ""
  return TITLE_ICON_MAP[title.code] || "✦"
}

function renderDisplayName(name, role, leaderboardRank) {
  const isAdmin = (role || "").toLowerCase() === "admin"
  const podiumIcon = getPodiumIcon(leaderboardRank)

  return `${isAdmin ? "🛡️ " : ""}${podiumIcon ? `${podiumIcon} ` : ""}${name}`
}

function App() {
  const [books, setBooks] = useState([])
  const [selectedBook, setSelectedBook] = useState(null)
  const [detailBook, setDetailBook] = useState(null)
  const [booksError, setBooksError] = useState("")
  const [loadingBooks, setLoadingBooks] = useState(false)
  const [currentPageView, setCurrentPageView] = useState("library")
  const [currentUser, setCurrentUser] = useState(() => getStoredUser())
  const [currentPage, setCurrentPage] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [savedProgress, setSavedProgress] = useState(null)
  const [pdfReady, setPdfReady] = useState(false)
  const [pdfPageInput, setPdfPageInput] = useState("1")
  const [isReaderFullscreen, setIsReaderFullscreen] = useState(false)
  const [readingProgress, setReadingProgress] = useState({
    format: "",
    progressValue: "",
    percentage: 0
  })
  const [searchTerm, setSearchTerm] = useState("")
  const [formatFilter, setFormatFilter] = useState("all")
  const [sortBy, setSortBy] = useState("recent")
  const [readerReturnPage, setReaderReturnPage] = useState("library")
  const [readerSettingsOpen, setReaderSettingsOpen] = useState(false)
  const [profileUserId, setProfileUserId] = useState(null)
  const [profileData, setProfileData] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileForm, setProfileForm] = useState({
    displayName: "",
    bio: "",
    avatarUrl: "",
    favoriteGenres: "",
    favoriteBook: "",
    selectedTitle: ""
  })
  const [goalForm, setGoalForm] = useState({
    weeklyReadingDaysGoal: 4,
    monthlyBooksGoal: 2
  })
  const [avatarUploadFile, setAvatarUploadFile] = useState(null)
  const [profileEditorOpen, setProfileEditorOpen] = useState(false)
  const [myListBooks, setMyListBooks] = useState([])
  const [communityFeed, setCommunityFeed] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const [communityLoading, setCommunityLoading] = useState(false)
  const [detailReviews, setDetailReviews] = useState([])
  const [reviewSummary, setReviewSummary] = useState({
    reviewCount: 0,
    averageRating: 0
  })
  const [reviewDraft, setReviewDraft] = useState({
    rating: 5,
    comment: ""
  })
  const [reviewLoading, setReviewLoading] = useState(false)
  const [readerSettings, setReaderSettings] = useState({
    pdfScale: 1,
    pdfTheme: "dark",
    epubFontSize: 100,
    epubLineHeight: 1.7,
    epubTheme: "paper"
  })

  const token = getToken()
  const readerShellRef = useRef(null)
  const pdfWrapRef = useRef(null)
  const pendingPdfScrollTopRef = useRef(null)

  const resetReaderState = useCallback(() => {
    setSelectedBook(null)
    setSavedProgress(null)
    setPdfReady(false)
    setCurrentPage(1)
    setNumPages(0)
    setPdfPageInput("1")
    setReadingProgress({
      format: "",
      progressValue: "",
      percentage: 0
    })
    setIsReaderFullscreen(false)
    setReaderSettingsOpen(false)
  }, [])

  const logout = useCallback(() => {
    clearStoredAuth()
    setCurrentUser(null)
    setBooks([])
    setBooksError("")
    setCurrentPageView("library")
    setDetailBook(null)
    resetReaderState()

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    }
  }, [resetReaderState])

  useEffect(() => {
    return subscribeToUnauthorized(() => {
      logout()
    })
  }, [logout])

  const fetchBooks = useCallback(async () => {
    if (!token) return

    try {
      setLoadingBooks(true)
      setBooksError("")

      const data = await fetchLibraryBooks()

      if (Array.isArray(data)) {
        setBooks(data)
      } else {
        setBooks([])
        setBooksError("Backend returned invalid data for /books/library.")
      }
    } catch (error) {
      console.error("Failed to fetch library:", error)

      if (error.message === "Your session has expired. Please log in again.") {
        return
      }

      setBooks([])
      setBooksError(error.message || "Failed to fetch books from backend.")
    } finally {
      setLoadingBooks(false)
    }
  }, [token])

  useEffect(() => {
    if (!currentUser || !token) return
    fetchBooks()
  }, [currentUser, token, fetchBooks])

  const loadMyList = useCallback(async () => {
    if (!currentUser || !token) return

    try {
      const data = await getMyList()
      setMyListBooks(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error("Failed to load My List:", error)
    }
  }, [currentUser, token])

  useEffect(() => {
    loadMyList()
  }, [loadMyList])

  useEffect(() => {
    if (currentPageView !== "profile" || !currentUser || !token) return

    const targetUserId = profileUserId || currentUser.userId

    const loadProfile = async () => {
      try {
        setProfileLoading(true)
        const data =
          targetUserId === currentUser.userId
            ? await getMyProfile()
            : await getProfile(targetUserId)

        setProfileData(data)
        setProfileForm({
          displayName: data.profile?.DisplayName || "",
          bio: data.profile?.Bio || "",
          avatarUrl: data.profile?.AvatarUrl || "",
          favoriteGenres: data.profile?.FavoriteGenres || "",
          favoriteBook: data.profile?.FavoriteBook || "",
          selectedTitle: data.profile?.SelectedTitle || data.activeTitle?.code || ""
        })
        setGoalForm({
          weeklyReadingDaysGoal: data.profile?.WeeklyReadingDaysGoal || 4,
          monthlyBooksGoal: data.profile?.MonthlyBooksGoal || 2
        })
      } catch (error) {
        console.error("Failed to load profile:", error)
      } finally {
        setProfileLoading(false)
      }
    }

    loadProfile()
  }, [currentPageView, profileUserId, currentUser, token])

  useEffect(() => {
    if (currentPageView !== "community" || !currentUser || !token) return

    const loadCommunity = async () => {
      try {
        setCommunityLoading(true)
        const [feedData, leaderboardData] = await Promise.all([
          getCommunityFeed(),
          getLeaderboard()
        ])

        setCommunityFeed(Array.isArray(feedData) ? feedData : [])
        setLeaderboard(Array.isArray(leaderboardData) ? leaderboardData : [])
      } catch (error) {
        console.error("Failed to load community:", error)
      } finally {
        setCommunityLoading(false)
      }
    }

    loadCommunity()
  }, [currentPageView, currentUser, token])

  useEffect(() => {
    if (currentPageView !== "detail" || !detailBook || !currentUser || !token) return

    const loadReviews = async () => {
      try {
        setReviewLoading(true)
        const data = await getBookReviews(detailBook.BookId)
        setDetailReviews(data.reviews || [])
        setReviewSummary(data.summary || { reviewCount: 0, averageRating: 0 })
        setReviewDraft({
          rating: data.currentUserReview?.Rating || 5,
          comment: data.currentUserReview?.Comment || ""
        })
      } catch (error) {
        console.error("Failed to load reviews:", error)
      } finally {
        setReviewLoading(false)
      }
    }

    loadReviews()
  }, [currentPageView, detailBook, currentUser, token])

  useEffect(() => {
    if (!selectedBook || !currentUser || !token) return

    setSavedProgress(null)
    setPdfReady(false)
    setCurrentPage(1)
    setNumPages(0)
    setPdfPageInput("1")
    setReadingProgress({
      format: "",
      progressValue: "",
      percentage: 0
    })

    const loadProgress = async () => {
      try {
        const data = await fetchProgress(selectedBook.BookId)
        setSavedProgress(data)
      } catch (error) {
        console.error("Failed to load progress:", error)
      }
    }

    loadProgress()
  }, [selectedBook, currentUser, token])

  useEffect(() => {
    if (!savedProgress) return
    if (!selectedBook) return
    if (selectedBook.FileType !== "pdf") return

    const savedFormat = savedProgress.Format || savedProgress.format
    const savedValue = savedProgress.ProgressValue || savedProgress.progressValue

    if (savedFormat !== "pdf") return

    const page = parseInt(savedValue, 10)
    if (!Number.isNaN(page) && page > 0) {
      setCurrentPage(page)
      setPdfPageInput(String(page))
    }
  }, [savedProgress, selectedBook])

  useEffect(() => {
    if (!selectedBook) return
    if (selectedBook.FileType !== "pdf") return
    if (!pdfReady) return
    if (!readingProgress.format || !readingProgress.progressValue) return
    if (!token) return

    const timeout = setTimeout(async () => {
      try {
        await saveProgress(selectedBook.BookId, readingProgress)
      } catch (error) {
        console.error("Failed to save PDF progress:", error)
      }
    }, 700)

    return () => clearTimeout(timeout)
  }, [readingProgress, selectedBook, pdfReady, token])

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsReaderFullscreen(!!document.fullscreenElement)
    }

    document.addEventListener("fullscreenchange", onFullscreenChange)

    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange)
    }
  }, [])

  const pdfFileUrl = useMemo(() => {
    if (!selectedBook || selectedBook.FileType !== "pdf") return null

    return `${API_BASE}/books/${selectedBook.BookId}/read`
  }, [selectedBook])

  const pdfDocumentFile = useMemo(() => {
    if (!pdfFileUrl || !token) return null

    return {
      url: pdfFileUrl,
      httpHeaders: {
        Authorization: `Bearer ${token}`
      }
    }
  }, [pdfFileUrl, token])

  const onDocumentLoadSuccess = ({ numPages: loadedPageCount }) => {
    setNumPages(loadedPageCount)
    setPdfReady(true)

    if (pdfWrapRef.current && pendingPdfScrollTopRef.current != null) {
      pdfWrapRef.current.scrollTop = pendingPdfScrollTopRef.current
      pendingPdfScrollTopRef.current = null
    }

    setReadingProgress((prev) => {
      if (prev.format === "pdf" && prev.progressValue === String(currentPage)) {
        return prev
      }

      return {
        format: "pdf",
        progressValue: String(currentPage),
        percentage: loadedPageCount ? (currentPage / loadedPageCount) * 100 : 0
      }
    })
  }

  const onDocumentLoadError = (error) => {
    console.error("PDF load error:", error)
    setPdfReady(false)
  }

  const goToPage = useCallback(
    (pageNumber) => {
      if (!pdfReady || !numPages) return

      const safePage = Math.max(1, Math.min(numPages, pageNumber))

      if (pdfWrapRef.current) {
        pendingPdfScrollTopRef.current = pdfWrapRef.current.scrollTop
      }

      setCurrentPage(safePage)
      setPdfPageInput(String(safePage))
      setReadingProgress({
        format: "pdf",
        progressValue: String(safePage),
        percentage: numPages ? (safePage / numPages) * 100 : 0
      })
    },
    [pdfReady, numPages]
  )

  const goToNextPage = useCallback(() => {
    if (!pdfReady) return
    if (currentPage >= numPages) return
    goToPage(currentPage + 1)
  }, [pdfReady, currentPage, numPages, goToPage])

  const goToPreviousPage = useCallback(() => {
    if (!pdfReady) return
    if (currentPage <= 1) return
    goToPage(currentPage - 1)
  }, [pdfReady, currentPage, goToPage])

  useEffect(() => {
    if (!selectedBook) return

    const onKeyDown = (e) => {
      if (selectedBook.FileType === "pdf") {
        if (e.key === "ArrowRight") {
          e.preventDefault()
          goToNextPage()
        }

        if (e.key === "ArrowLeft") {
          e.preventDefault()
          goToPreviousPage()
        }
      }

      if (e.key === "Escape") {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {})
        }

        setIsReaderFullscreen(false)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [selectedBook, goToNextPage, goToPreviousPage])

  const handlePdfJumpSubmit = (e) => {
    e.preventDefault()
    const page = parseInt(pdfPageInput, 10)

    if (!Number.isNaN(page)) {
      goToPage(page)
    }
  }

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement && readerShellRef.current) {
        await readerShellRef.current.requestFullscreen()
        setIsReaderFullscreen(true)
      } else {
        await document.exitFullscreen()
        setIsReaderFullscreen(false)
      }
    } catch (error) {
      console.error("Fullscreen toggle failed:", error)
    }
  }

  const openBook = (book, returnPage = currentPageView) => {
    setSelectedBook(book)
    setReaderReturnPage(returnPage)
    setReaderSettingsOpen(false)
    setCurrentPageView("reader")
  }

  const openBookDetails = (book, sourcePage = currentPageView) => {
    setDetailBook(book)
    setCurrentPageView("detail")
    setReaderReturnPage(sourcePage)
  }

  const openProfilePage = useCallback(
    (userId = currentUser?.userId) => {
      setProfileUserId(userId || currentUser?.userId || null)
      setDetailBook(null)
      setCurrentPageView("profile")
    },
    [currentUser]
  )

  const handleToggleMyList = useCallback(
    async (book) => {
      const isSaved = myListBooks.some((item) => item.BookId === book.BookId)

      try {
        if (isSaved) {
          await removeBookFromMyList(book.BookId)
        } else {
          await addBookToMyList(book.BookId)
        }

        await loadMyList()
      } catch (error) {
        console.error("Failed to update My List:", error)
      }
    },
    [loadMyList, myListBooks]
  )

  const handleSaveReview = useCallback(async () => {
    if (!detailBook) return

    try {
      await saveBookReview(detailBook.BookId, reviewDraft)
      const data = await getBookReviews(detailBook.BookId)
      setDetailReviews(data.reviews || [])
      setReviewSummary(data.summary || { reviewCount: 0, averageRating: 0 })
    } catch (error) {
      console.error("Failed to save review:", error)
    }
  }, [detailBook, reviewDraft])

  const handleHelpfulVote = useCallback(
    async (reviewId) => {
      if (!detailBook) return

      try {
        await toggleHelpfulVote(reviewId)
        const data = await getBookReviews(detailBook.BookId)
        setDetailReviews(data.reviews || [])
        setReviewSummary(data.summary || { reviewCount: 0, averageRating: 0 })
      } catch (error) {
        console.error("Failed to update helpful vote:", error)
      }
    },
    [detailBook]
  )

  const handleSaveProfile = useCallback(async () => {
    try {
      await updateMyProfile(profileForm)
      const data = await getMyProfile()
      setProfileData(data)
    } catch (error) {
      console.error("Failed to save profile:", error)
    }
  }, [profileForm])

  const handleSaveGoals = useCallback(async () => {
    try {
      await updateMyGoals(goalForm)
      const data = await getMyProfile()
      setProfileData(data)
    } catch (error) {
      console.error("Failed to save goals:", error)
    }
  }, [goalForm])

  const handleUploadAvatar = useCallback(async () => {
    if (!avatarUploadFile) return

    try {
      await uploadMyAvatar(avatarUploadFile)
      const data = await getMyProfile()
      setProfileData(data)
      setAvatarUploadFile(null)
    } catch (error) {
      console.error("Failed to upload avatar:", error)
    }
  }, [avatarUploadFile])

  const handleToggleFollow = useCallback(async () => {
    if (!profileData?.profile?.UserId || profileData.isCurrentUser) return

    try {
      if (profileData.isFollowing) {
        await unfollowUser(profileData.profile.UserId)
      } else {
        await followUser(profileData.profile.UserId)
      }

      const refreshed = await getProfile(profileData.profile.UserId)
      setProfileData(refreshed)
    } catch (error) {
      console.error("Failed to update follow state:", error)
    }
  }, [profileData])

  const handleAdminEditReview = useCallback(
    async (review) => {
      const nextRating = window.prompt("Update rating (1-5)", String(review.Rating || 5))
      if (nextRating == null) return

      const nextComment = window.prompt("Update comment", review.Comment || "")
      if (nextComment == null) return

      try {
        await updateAdminReview(review.ReviewId, {
          rating: Number(nextRating),
          comment: nextComment
        })
        if (detailBook) {
          const data = await getBookReviews(detailBook.BookId)
          setDetailReviews(data.reviews || [])
          setReviewSummary(data.summary || { reviewCount: 0, averageRating: 0 })
        }
      } catch (error) {
        console.error("Failed to update review:", error)
      }
    },
    [detailBook]
  )

  const handleAdminDeleteReview = useCallback(
    async (review) => {
      const confirmed = window.confirm("Delete this review?")
      if (!confirmed) return

      try {
        await deleteAdminReview(review.ReviewId)
        if (detailBook) {
          const data = await getBookReviews(detailBook.BookId)
          setDetailReviews(data.reviews || [])
          setReviewSummary(data.summary || { reviewCount: 0, averageRating: 0 })
        }
      } catch (error) {
        console.error("Failed to delete review:", error)
      }
    },
    [detailBook]
  )

  const closeBook = () => {
    resetReaderState()
    setCurrentPageView(readerReturnPage || "library")

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    }
  }

  const closeBookDetails = () => {
    setDetailBook(null)
    setCurrentPageView(readerReturnPage || "library")
  }

  const handleAuthSuccess = (user) => {
    setCurrentUser(user)
    setBooks([])
    setBooksError("")
    setCurrentPageView("library")
    setDetailBook(null)
    resetReaderState()
  }

  const filteredBooks = useMemo(() => {
    let result = [...books]
    const query = searchTerm.trim().toLowerCase()

    if (query) {
      result = result.filter((book) => {
        const haystack = [
          book.Title,
          book.Author,
          book.Description,
          book.FileType
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()

        return haystack.includes(query)
      })
    }

    if (formatFilter !== "all") {
      result = result.filter(
        (book) => (book.FileType || "").toLowerCase() === formatFilter
      )
    }

    if (sortBy === "title") {
      result.sort((a, b) => (a.Title || "").localeCompare(b.Title || ""))
    } else if (sortBy === "author") {
      result.sort((a, b) => (a.Author || "").localeCompare(b.Author || ""))
    } else if (sortBy === "progress") {
      result.sort(
        (a, b) =>
          formatPercent(b.progress?.Percentage) - formatPercent(a.progress?.Percentage)
      )
    } else {
      result.sort((a, b) => {
        const aTime = a.progress?.UpdatedAt
          ? new Date(a.progress.UpdatedAt).getTime()
          : new Date(a.CreatedAt || 0).getTime()

        const bTime = b.progress?.UpdatedAt
          ? new Date(b.progress.UpdatedAt).getTime()
          : new Date(b.CreatedAt || 0).getTime()

        return bTime - aTime
      })
    }

    return result
  }, [books, searchTerm, formatFilter, sortBy])

  const featuredBooks = useMemo(() => {
    return [...books]
      .filter((book) => book.IsFeatured)
      .sort((a, b) => {
        const aRank = Number.isFinite(Number(a.FeaturedRank)) ? Number(a.FeaturedRank) : 999999
        const bRank = Number.isFinite(Number(b.FeaturedRank)) ? Number(b.FeaturedRank) : 999999

        if (aRank !== bRank) {
          return aRank - bRank
        }

        return new Date(b.CreatedAt || 0).getTime() - new Date(a.CreatedAt || 0).getTime()
      })
      .slice(0, 4)
  }, [books])

  const continueReadingBooks = useMemo(() => {
    return [...books]
      .filter((book) => formatPercent(book.progress?.Percentage) > 0)
      .sort(
        (a, b) =>
          new Date(b.progress?.UpdatedAt || 0).getTime() -
          new Date(a.progress?.UpdatedAt || 0).getTime()
      )
      .slice(0, 4)
  }, [books])

  const myListActiveBooks = useMemo(
    () => myListBooks.filter((book) => formatPercent(book.progress?.Percentage) < 100),
    [myListBooks]
  )

  const myListCompletedBooks = useMemo(
    () => myListBooks.filter((book) => formatPercent(book.progress?.Percentage) >= 100),
    [myListBooks]
  )

  if (!currentUser) {
    return (
      <div className="app-shell auth-shell">
        <div className="auth-layout">
          <div className="brand-header auth-brand-header">
            <div className="brand-badge brand-badge-image">
              <img
                alt="OnlineReader logo"
                className="brand-logo-image"
                src={`${process.env.PUBLIC_URL}/logo.png`}
                onError={(event) => {
                  event.currentTarget.onerror = null
                  event.currentTarget.src = `${process.env.PUBLIC_URL}/logo192.png`
                }}
              />
            </div>
            <div>
              <h1 className="brand-title">OnlineReader</h1>
              <p className="brand-subtitle">
                Read beautifully. Track progress. Pick up where you left off.
              </p>
            </div>
          </div>

          <AuthPanel onAuthSuccess={handleAuthSuccess} />
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="topbar-brand">
          <div className="brand-badge brand-badge-image brand-badge-header">
            <img
              alt="OnlineReader logo"
              className="brand-logo-image"
              src={`${process.env.PUBLIC_URL}/logo.png`}
              onError={(event) => {
                event.currentTarget.onerror = null
                event.currentTarget.src = `${process.env.PUBLIC_URL}/logo192.png`
              }}
            />
          </div>

          <div>
          <h1 className="brand-title">OnlineReader</h1>
          <p className="brand-subtitle">Your personal cloud reading platform</p>
          </div>
        </div>

        <div className="topbar-right">
          <div className="topbar-actions">
            <button
              className={`secondary-btn ${currentPageView === "library" ? "active-tab" : ""}`}
              onClick={() => {
                setDetailBook(null)
                setCurrentPageView("library")
              }}
              type="button"
            >
              Library
            </button>

            <button
              className={`secondary-btn ${currentPageView === "my-list" ? "active-tab" : ""}`}
              onClick={() => {
                setDetailBook(null)
                setCurrentPageView("my-list")
              }}
              type="button"
            >
              My List
            </button>

            <button
              className={`secondary-btn ${currentPageView === "community" ? "active-tab" : ""}`}
              onClick={() => {
                setDetailBook(null)
                setCurrentPageView("community")
              }}
              type="button"
            >
              Community
            </button>

            <button
              className={`secondary-btn ${currentPageView === "profile" ? "active-tab" : ""}`}
              onClick={() => openProfilePage(currentUser.userId)}
              type="button"
            >
              Profile
            </button>

            {currentUser.role === "admin" && (
              <button
                className={`secondary-btn ${currentPageView === "admin" ? "active-tab" : ""}`}
                onClick={() => {
                  setDetailBook(null)
                  setCurrentPageView("admin")
                }}
                type="button"
              >
                Admin Panel
              </button>
            )}
          </div>

          <div className="user-card">
            <div className="user-card-email">{currentUser.email}</div>
            <div className="user-card-role">{currentUser.role}</div>
            <button className="secondary-btn" onClick={logout} type="button">
              Logout
            </button>
          </div>
        </div>
      </div>

      {currentPageView === "admin" && currentUser.role === "admin" && (
        <AdminPanel currentUser={currentUser} onLibraryRefresh={fetchBooks} />
      )}

      {currentPageView === "my-list" && !selectedBook && (
        <div className="my-list-page">
          <div className="section-header">
            <div>
              <div className="eyebrow-text">Personal Shelf</div>
              <h2 className="section-title">My List</h2>
            </div>
          </div>

          {myListBooks.length === 0 ? (
            <div className="empty-state">
              <p>Your list is empty right now.</p>
            </div>
          ) : (
            <>
              <section className="my-list-section">
                <div className="section-header">
                  <div>
                    <h3 className="community-title">Reading Queue</h3>
                    <p className="section-subtitle">Books you still want to read or finish.</p>
                  </div>
                </div>

                {myListActiveBooks.length === 0 ? (
                  <div className="empty-state">
                    <p>No active books in your list right now.</p>
                  </div>
                ) : (
                  <div className="home-card-grid">
                    {myListActiveBooks.map((book) => (
                      <article key={book.BookId} className="home-library-card">
                        <div className="home-library-cover">
                          <BookCover book={book} />
                        </div>

                        <div className="home-library-body">
                          <h3>{book.Title}</h3>
                          <p>{book.Author || "Unknown"}</p>
                          <div className="home-library-actions">
                            <button
                              className="primary-btn"
                              onClick={() => openBook(book, "my-list")}
                              type="button"
                            >
                              {formatPercent(book.progress?.Percentage) > 0
                                ? "Resume Reading"
                                : "Read Book"}
                            </button>
                            <button
                              className="secondary-btn"
                              onClick={() => openBookDetails(book, "my-list")}
                              type="button"
                            >
                              Details
                            </button>
                            <button
                              className="secondary-btn"
                              onClick={() => handleToggleMyList(book)}
                              type="button"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="my-list-section">
                <div className="section-header">
                  <div>
                    <h3 className="community-title">Read Books</h3>
                    <p className="section-subtitle">Books you have fully completed.</p>
                  </div>
                </div>

                {myListCompletedBooks.length === 0 ? (
                  <div className="empty-state">
                    <p>You have not completed any books in My List yet.</p>
                  </div>
                ) : (
                  <div className="home-card-grid">
                    {myListCompletedBooks.map((book) => (
                      <article key={book.BookId} className="home-library-card">
                        <div className="home-library-cover">
                          <BookCover book={book} />
                        </div>

                        <div className="home-library-body">
                          <h3>{book.Title}</h3>
                          <p>{book.Author || "Unknown"}</p>
                          <div className="home-library-actions">
                            <button
                              className="secondary-btn"
                              onClick={() => openBookDetails(book, "my-list")}
                              type="button"
                            >
                              View Details
                            </button>
                            <button
                              className="secondary-btn"
                              onClick={() => handleToggleMyList(book)}
                              type="button"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      )}

      {currentPageView === "community" && !selectedBook && (
        <div className="community-page">
          <div className="section-header">
            <div>
              <div className="eyebrow-text">Reader Community</div>
              <h2 className="section-title">Activity and Leaderboards</h2>
            </div>
          </div>

          {communityLoading ? (
            <p className="message-text">Loading community...</p>
          ) : (
            <div className="community-layout">
              <section className="community-card">
                <h3 className="community-title">Reading Feed</h3>
                <div className="community-feed">
                  {communityFeed.map((activity) => (
                    <button
                      key={activity.ActivityId}
                      className="community-feed-item"
                      onClick={() => openProfilePage(activity.UserId)}
                      type="button"
                    >
                      <div className="community-feed-head">
                        <div className="community-avatar">
                          {(activity.AvatarImagePath || activity.AvatarUrl) ? (
                            <img
                              alt={getUserDisplayName(activity, activity.Email)}
                              src={
                                activity.AvatarImagePath
                                  ? `${API_BASE}/profiles/${activity.UserId}/avatar?v=${encodeURIComponent(
                                      activity.ProfileUpdatedAt || activity.AvatarImagePath || "avatar"
                                    )}`
                                  : activity.AvatarUrl
                              }
                            />
                          ) : (
                            <span>
                              {(activity.DisplayName || activity.Email || "R").slice(0, 1)}
                            </span>
                          )}
                        </div>
                        <div className="community-feed-copy">
                          <strong className={(activity.Role || "").toLowerCase() === "admin" ? "staff-name" : ""}>
                            {renderDisplayName(
                              getUserDisplayName(activity, activity.Email),
                              activity.Role,
                              activity.LeaderboardRank
                            )}
                          </strong>
                          <div className={`table-subtext level-chip ${getLevelToneClass(activity.Level)}`}>
                            LV {activity.Level || 1}
                          </div>
                          {activity.ActiveTitle?.label ? (
                            <div
                              className={`table-subtext prestige-title title-chip ${getTitleToneClass(
                                activity.ActiveTitle.code
                              )}`}
                            >
                              <span>{getTitleIcon(activity.ActiveTitle)}</span>
                              <span>{activity.ActiveTitle.label}</span>
                            </div>
                          ) : (
                            <div className="table-subtext prestige-title">
                              {getPrestigeTitle(activity.Level)}
                            </div>
                          )}
                        </div>
                      </div>
                      <span>{formatActivityMessage(activity)}</span>
                      <small>{formatDate(activity.CreatedAt)}</small>
                    </button>
                  ))}
                </div>
              </section>

              <section className="community-card">
                <h3 className="community-title">Top Readers</h3>
                <div className="leaderboard-list">
                  {leaderboard.map((entry, index) => (
                    <button
                      key={entry.userId}
                      className="leaderboard-item"
                      onClick={() => openProfilePage(entry.userId)}
                      type="button"
                    >
                      <div className="leaderboard-main">
                        <div className="community-avatar">
                          {(entry.avatarImagePath || entry.avatarUrl) ? (
                            <img
                              alt={entry.displayName}
                              src={
                                entry.avatarImagePath
                                  ? `${API_BASE}/profiles/${entry.userId}/avatar?v=${encodeURIComponent(
                                      entry.profileUpdatedAt || entry.avatarImagePath || "avatar"
                                    )}`
                                  : entry.avatarUrl
                              }
                            />
                          ) : (
                            <span>{(entry.displayName || "R").slice(0, 1)}</span>
                          )}
                        </div>
                        <div className="leaderboard-copy">
                          <strong>
                            <span className="leaderboard-rank">#{index + 1}</span>
                            <span className={(entry.role || "").toLowerCase() === "admin" ? "staff-name" : ""}>
                              {renderDisplayName(entry.displayName, entry.role, index + 1)}
                            </span>
                          </strong>
                          <div className="leaderboard-meta-row">
                            <span className={`level-chip ${getLevelToneClass(entry.level)}`}>
                              LV {entry.level || 1}
                            </span>
                            <span>{entry.experiencePoints || 0} XP</span>
                          </div>
                          {entry.activeTitle?.label ? (
                            <div
                              className={`table-subtext prestige-title title-chip ${getTitleToneClass(
                                entry.activeTitle.code
                              )}`}
                            >
                              <span>{getTitleIcon(entry.activeTitle)}</span>
                              <span>{entry.activeTitle.label}</span>
                            </div>
                          ) : (
                            <div className="table-subtext prestige-title">
                              {getPrestigeTitle(entry.level)}
                            </div>
                          )}
                        </div>
                      </div>
                      <small>{entry.completedBooks} finished</small>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      )}

      {currentPageView === "profile" && !selectedBook && (
        <div className="profile-page">
          {profileLoading || !profileData ? (
            <p className="message-text">Loading profile...</p>
          ) : (
            <>
              <section className="profile-hero">
                <div className="profile-avatar">
                  {getProfileAvatarSrcWithCache(profileData.profile) ? (
                    <img
                      alt={profileData.profile?.DisplayName || "Profile avatar"}
                      className="profile-avatar-image"
                      src={getProfileAvatarSrcWithCache(profileData.profile)}
                    />
                  ) : (
                    <span>
                      {(profileData.profile?.DisplayName || profileData.profile?.Email || "R")
                        .slice(0, 1)
                        .toUpperCase()}
                    </span>
                  )}
                </div>

                <div className="profile-summary">
                  <div className="eyebrow-text">
                    {profileData.isCurrentUser ? "Your Profile" : "Reader Profile"}
                  </div>
                  <h2 className="detail-title">
                    <span
                      className={
                        (profileData.profile?.Role || "").toLowerCase() === "admin"
                          ? "staff-name"
                          : ""
                      }
                    >
                      {renderDisplayName(
                        profileData.profile?.DisplayName || profileData.profile?.Email,
                        profileData.profile?.Role,
                        profileData.stats?.leaderboardRank
                      )}
                    </span>
                  </h2>
                  <p className="detail-author">{profileData.profile?.Bio || "No bio yet."}</p>
                  <div className="profile-meta-row">
                    <span className={`level-chip ${getLevelToneClass(profileData.level?.level)}`}>
                      Level {profileData.level?.level || 1}
                    </span>
                    <span
                      className={`prestige-title-chip title-chip ${getTitleToneClass(
                        profileData.activeTitle?.code
                      )}`}
                    >
                      <span>{getTitleIcon(profileData.activeTitle)}</span>
                      <span>
                        {profileData.activeTitle?.label || getPrestigeTitle(profileData.level?.level)}
                      </span>
                    </span>
                    {profileData.stats?.leaderboardRank ? (
                      <span>
                        Rank #{profileData.stats.leaderboardRank}
                      </span>
                    ) : null}
                    <span>{profileData.stats.followersCount} followers</span>
                    <span>{profileData.stats.followingCount} following</span>
                    <span>{profileData.stats.currentStreak} day streak</span>
                  </div>

                  <div className="level-progress-card">
                    <div className="book-progress-header">
                      <span>Level progress</span>
                      <span>
                        {profileData.level?.currentXpIntoLevel || 0}/
                        {profileData.level?.nextLevelXp || 100} XP
                      </span>
                    </div>
                    <div className="book-progress-bar">
                      <div
                        className="book-progress-fill"
                        style={{ width: `${profileData.level?.progressPercent || 0}%` }}
                      />
                    </div>
                  </div>

                  {!profileData.isCurrentUser && (
                    <button className="primary-btn" onClick={handleToggleFollow} type="button">
                      {profileData.isFollowing ? "Unfollow" : "Follow"}
                    </button>
                  )}

                  {profileData.isCurrentUser && (
                    <button
                      className="secondary-btn"
                      onClick={() => setProfileEditorOpen((current) => !current)}
                      type="button"
                    >
                      {profileEditorOpen ? "Close Profile Settings" : "Customize Profile"}
                    </button>
                  )}
                </div>
              </section>

              <div className="profile-grid">
                <section className="community-card">
                  <h3 className="community-title">Badges</h3>
                  <div className="badge-grid">
                    {(profileData.badges || []).map((badge) => (
                      <div key={badge.code} className="badge-card">
                        <div className="badge-icon">{getBadgeIcon(badge.icon)}</div>
                        <strong>{badge.label}</strong>
                        <span>{badge.description}</span>
                      </div>
                    ))}
                  </div>

                  <div className="detail-stats">
                    <div className="detail-stat">
                      <span>Current streak</span>
                      <strong>{profileData.stats.currentStreak} days</strong>
                    </div>
                    <div className="detail-stat">
                      <span>Best streak</span>
                      <strong>{profileData.stats.bestStreak} days</strong>
                    </div>
                    <div className="detail-stat">
                      <span>Completed books</span>
                      <strong>{profileData.stats.completedBooks}</strong>
                    </div>
                  </div>
                </section>

                <section className="community-card">
                  <h3 className="community-title">Goals and Rewards</h3>
                  <div className="challenge-list">
                    {(profileData.challenges || []).map((challenge) => (
                      <div key={challenge.code} className="challenge-card">
                        <strong>{challenge.title}</strong>
                        <span>{challenge.description}</span>
                        <div className="book-progress-bar">
                          <div
                            className="book-progress-fill"
                            style={{
                              width: `${challenge.target ? (challenge.progress / challenge.target) * 100 : 0}%`
                            }}
                          />
                        </div>
                        <small>
                          {challenge.progress}/{challenge.target}
                        </small>
                        <small className="challenge-reward">
                          Reward: +{challenge.xpReward} XP
                          {challenge.rewarded ? " • Claimed" : challenge.completed ? " • Ready" : ""}
                        </small>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="community-card">
                  <h3 className="community-title">Recent Activity</h3>
                  <div className="community-feed">
                    {(profileData.recentActivity || []).map((activity) => (
                      <div key={activity.ActivityId} className="community-feed-item static-feed-item">
                        <strong className={(activity.Role || "").toLowerCase() === "admin" ? "staff-name" : ""}>
                          {formatActivityMessage(activity)}
                        </strong>
                        <small>{formatDate(activity.CreatedAt)}</small>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              {profileData.isCurrentUser && profileEditorOpen && (
                <div className="profile-grid">
                  <section className="community-card">
                    <h3 className="community-title">Customize Profile</h3>
                    <div className="admin-form">
                      <input
                        className="input"
                        placeholder="Display name"
                        value={profileForm.displayName}
                        onChange={(e) =>
                          setProfileForm((current) => ({
                            ...current,
                            displayName: e.target.value
                          }))
                        }
                      />
                      <textarea
                        className="textarea"
                        placeholder="Bio"
                        value={profileForm.bio}
                        onChange={(e) =>
                          setProfileForm((current) => ({
                            ...current,
                            bio: e.target.value
                          }))
                        }
                      />
                      <input
                        className="input"
                        placeholder="Avatar image URL"
                        value={profileForm.avatarUrl}
                        onChange={(e) =>
                          setProfileForm((current) => ({
                            ...current,
                            avatarUrl: e.target.value
                          }))
                        }
                      />
                      <div className="file-field">
                        <label className="file-label" htmlFor="avatar-upload">
                          Upload profile photo
                        </label>
                        <input
                          id="avatar-upload"
                          className="file-input"
                          type="file"
                          accept=".jpg,.jpeg,.png,.webp,image/*"
                          onChange={(e) => setAvatarUploadFile(e.target.files?.[0] || null)}
                        />
                        <button
                          className="secondary-btn"
                          onClick={handleUploadAvatar}
                          disabled={!avatarUploadFile}
                          type="button"
                        >
                          Upload Avatar
                        </button>
                      </div>
                      <select
                        className="toolbar-select"
                        value={profileForm.selectedTitle}
                        onChange={(e) =>
                          setProfileForm((current) => ({
                            ...current,
                            selectedTitle: e.target.value
                          }))
                        }
                      >
                        <option value="">Choose an unlocked title</option>
                        {(profileData.unlockedTitles || []).map((title) => (
                          <option key={title.code} value={title.code}>
                            {getTitleIcon(title)} {title.label}
                          </option>
                        ))}
                      </select>
                      <input
                        className="input"
                        placeholder="Favorite genres"
                        value={profileForm.favoriteGenres}
                        onChange={(e) =>
                          setProfileForm((current) => ({
                            ...current,
                            favoriteGenres: e.target.value
                          }))
                        }
                      />
                      <input
                        className="input"
                        placeholder="Favorite book"
                        value={profileForm.favoriteBook}
                        onChange={(e) =>
                          setProfileForm((current) => ({
                            ...current,
                            favoriteBook: e.target.value
                          }))
                        }
                      />
                      <button className="primary-btn" onClick={handleSaveProfile} type="button">
                        Save Profile
                      </button>
                    </div>
                  </section>

                  <section className="community-card">
                    <h3 className="community-title">Reading Goals</h3>
                    <div className="admin-form">
                      <div className="goal-summary-grid">
                        <div className="detail-stat">
                          <span>Active days this week</span>
                          <strong>{profileData.stats.activeDaysThisWeek}</strong>
                        </div>
                        <div className="detail-stat">
                          <span>Books completed this month</span>
                          <strong>{profileData.stats.completedThisMonth}</strong>
                        </div>
                      </div>
                      <input
                        className="input"
                        type="number"
                        min="1"
                        value={goalForm.weeklyReadingDaysGoal}
                        onChange={(e) =>
                          setGoalForm((current) => ({
                            ...current,
                            weeklyReadingDaysGoal: e.target.value
                          }))
                        }
                      />
                      <input
                        className="input"
                        type="number"
                        min="1"
                        value={goalForm.monthlyBooksGoal}
                        onChange={(e) =>
                          setGoalForm((current) => ({
                            ...current,
                            monthlyBooksGoal: e.target.value
                          }))
                        }
                      />
                      <p className="section-subtitle">
                        Weekly days goal tracks how many separate days you read in a rolling 7 day
                        window. Monthly books goal tracks completed books this calendar month.
                      </p>
                      <button className="primary-btn" onClick={handleSaveGoals} type="button">
                        Save Goals
                      </button>
                    </div>
                  </section>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {currentPageView === "detail" && detailBook && !selectedBook && (
        <div className="detail-page">
          <button className="secondary-btn" onClick={closeBookDetails} type="button">
            Back
          </button>

          <div className="detail-layout">
            <div className="detail-cover">
              <BookCover book={detailBook} />
            </div>

            <div className="detail-body">
              <div className="eyebrow-text">Book Details</div>
              <h2 className="detail-title">{detailBook.Title}</h2>
              <p className="detail-author">{detailBook.Author || "Unknown"}</p>
              <p className="detail-description">
                {detailBook.Description || "No description available for this title yet."}
              </p>

              <div className="detail-stats">
                <div className="detail-stat">
                  <span>Status</span>
                  <strong>{getReadingStatus(detailBook)}</strong>
                </div>
                <div className="detail-stat">
                  <span>Saved</span>
                  <strong>{formatSavedProgressLabel(detailBook.progress, detailBook.FileType)}</strong>
                </div>
                <div className="detail-stat">
                  <span>Progress</span>
                  <strong>{formatPercent(detailBook.progress?.Percentage).toFixed(1)}%</strong>
                </div>
              </div>

              <div className="detail-actions">
                <button
                  className="primary-btn"
                  onClick={() => openBook(detailBook, "detail")}
                  type="button"
                >
                  {formatPercent(detailBook.progress?.Percentage) > 0
                    ? "Resume Reading"
                    : "Start Reading"}
                </button>
                <button
                  className="secondary-btn"
                  onClick={() => setCurrentPageView("library")}
                  type="button"
                >
                  Browse Library
                </button>
                <button
                  className="secondary-btn"
                  onClick={() => handleToggleMyList(detailBook)}
                  type="button"
                >
                  {myListBooks.some((book) => book.BookId === detailBook.BookId)
                    ? "Remove From My List"
                    : "Add To My List"}
                </button>
              </div>

              <div className="community-card detail-community-card">
                <div className="section-header">
                  <div>
                    <h3 className="community-title">Ratings and Comments</h3>
                    <p className="admin-modal-subtitle">
                      {reviewSummary.reviewCount} reviews |{" "}
                      {formatAverageRating(reviewSummary.averageRating)}
                    </p>
                  </div>
                </div>

                <div className="admin-form">
                  <label className="reader-setting">
                    <span>Your rating</span>
                    <select
                      className="input"
                      value={reviewDraft.rating}
                      onChange={(e) =>
                        setReviewDraft((current) => ({
                          ...current,
                          rating: Number(e.target.value)
                        }))
                      }
                    >
                      <option value="5">5</option>
                      <option value="4">4</option>
                      <option value="3">3</option>
                      <option value="2">2</option>
                      <option value="1">1</option>
                    </select>
                  </label>
                  <textarea
                    className="textarea"
                    placeholder="Leave a comment"
                    value={reviewDraft.comment}
                    onChange={(e) =>
                      setReviewDraft((current) => ({
                        ...current,
                        comment: e.target.value
                      }))
                    }
                  />
                  <button className="primary-btn" onClick={handleSaveReview} type="button">
                    Save Review
                  </button>
                </div>

                {reviewLoading ? (
                  <p className="message-text">Loading reviews...</p>
                ) : (
                  <div className="review-list">
                    {detailReviews.map((review) => (
                      <article key={review.ReviewId} className="review-card">
                        <div className="review-card-header">
                          <div className="review-author-block">
                            <div className="community-avatar community-avatar-sm">
                              {(review.AvatarImagePath || review.AvatarUrl) ? (
                                <img
                                  alt={getUserDisplayName(review, review.Email)}
                                  src={getProfileAvatarSrcWithCache(review)}
                                />
                              ) : (
                                <span>{getUserDisplayName(review, review.Email).slice(0, 1)}</span>
                              )}
                            </div>
                            <button
                              className="text-btn"
                              onClick={() => openProfilePage(review.UserId)}
                              type="button"
                            >
                              <span className={(review.Role || "").toLowerCase() === "admin" ? "staff-name" : ""}>
                                {renderDisplayName(
                                  getUserDisplayName(review, review.Email),
                                  review.Role,
                                  review.LeaderboardRank
                                )}
                              </span>
                            </button>
                            {review.Level ? (
                              <div className={`table-subtext level-chip ${getLevelToneClass(review.Level)}`}>
                                LV {review.Level}
                              </div>
                            ) : null}
                            {review.ActiveTitle?.label ? (
                              <div
                                className={`table-subtext prestige-title title-chip ${getTitleToneClass(
                                  review.ActiveTitle.code
                                )}`}
                              >
                                <span>{getTitleIcon(review.ActiveTitle)}</span>
                                <span>{review.ActiveTitle.label}</span>
                              </div>
                            ) : (
                              <div className="table-subtext prestige-title">
                                {getPrestigeTitle(review.Level)}
                              </div>
                            )}
                          </div>
                          <strong>{review.Rating}/5</strong>
                        </div>
                        <p>{review.Comment || "No comment left."}</p>
                        <div className="review-card-footer">
                          <small>{formatDate(review.UpdatedAt)}</small>
                          <div className="admin-actions">
                            <button
                              className="secondary-btn"
                              onClick={() => handleHelpfulVote(review.ReviewId)}
                              type="button"
                            >
                              {review.HelpfulByCurrentUser ? "Unmark Helpful" : "Helpful"} (
                              {review.HelpfulCount || 0})
                            </button>
                            {currentUser.role === "admin" && (
                              <>
                                <button
                                  className="secondary-btn"
                                  onClick={() => handleAdminEditReview(review)}
                                  type="button"
                                >
                                  Edit Review
                                </button>
                                <button
                                  className="danger-btn"
                                  onClick={() => handleAdminDeleteReview(review)}
                                  type="button"
                                >
                                  Delete Review
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {currentPageView === "library" && !selectedBook && (
        <>
          {featuredBooks.length > 0 && (
            <div className="featured-section">
              <div className="section-header">
                <div>
                  <div className="eyebrow-text">Curated Selection</div>
                  <h2 className="section-title">Featured Books</h2>
                </div>
              </div>

              <div className="featured-grid">
                {featuredBooks.map((book) => (
                  <div key={book.BookId} className="featured-card">
                    <div className="featured-cover-wrap">
                      <BookCover book={book} />
                    </div>

                    <div className="featured-body">
                      <div className="featured-badge-row">
                        <span className="featured-badge">Featured</span>
                        <span className="featured-status">{getReadingStatus(book)}</span>
                      </div>

                      <h3 className="featured-title">{book.Title}</h3>
                      <p className="featured-author">{book.Author || "Unknown"}</p>
                      <p className="featured-description">
                        {book.Description || "A curated read waiting in your library."}
                      </p>

                      <div className="book-progress-block featured-progress-block">
                        <div className="book-progress-header">
                          <span>Progress</span>
                          <span>{formatPercent(book.progress?.Percentage).toFixed(1)}%</span>
                        </div>

                        <div className="book-progress-bar">
                          <div
                            className="book-progress-fill"
                            style={{ width: `${formatPercent(book.progress?.Percentage)}%` }}
                          />
                        </div>

                        <div className="book-progress-meta">
                          {formatSavedProgressLabel(book.progress, book.FileType)}
                        </div>
                      </div>

                      <button
                        className="primary-btn"
                        onClick={() => openBook(book, "library")}
                        type="button"
                      >
                        {formatPercent(book.progress?.Percentage) > 0
                          ? "Resume Reading"
                          : "Read Book"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {continueReadingBooks.length > 0 && (
            <div className="continue-section">
              <div className="section-header">
                <div>
                  <div className="eyebrow-text">Momentum</div>
                  <h2 className="section-title">Continue Reading</h2>
                </div>
              </div>

              <div className="continue-grid continue-grid-multi">
                {continueReadingBooks.map((book, index) => (
                  <div
                    key={book.BookId}
                    className={`continue-card ${index === 0 ? "continue-card-hero" : ""}`}
                  >
                    <div className="continue-cover">
                      <BookCover book={book} />
                    </div>

                    <div className="continue-body">
                      <div className="continue-title">{book.Title}</div>
                      <div className="continue-meta">
                        {book.Author || "Unknown"}
                      </div>

                      <div className="mini-progress-row">
                        <div className="mini-progress-bar">
                          <div
                            className="mini-progress-fill"
                            style={{
                              width: `${formatPercent(book.progress?.Percentage)}%`
                            }}
                          />
                        </div>
                        <span className="mini-progress-text">
                          {formatPercent(book.progress?.Percentage).toFixed(1)}%
                        </span>
                      </div>

                      <div className="continue-date">
                        {formatSavedProgressLabel(book.progress, book.FileType)}
                      </div>
                      <div className="continue-date">
                        Last opened: {formatDate(book.progress?.UpdatedAt) || "Recently"}
                      </div>

                      <button
                        className="primary-btn"
                        onClick={() => openBook(book, "library")}
                        type="button"
                      >
                        Resume Reading
                      </button>
                      <button
                        className="secondary-btn"
                        onClick={() => openBookDetails(book, "library")}
                        type="button"
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="library-toolbar">
            <input
              className="input toolbar-input"
              type="text"
              placeholder="Search by title, author, or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />

            <select
              className="input toolbar-select"
              value={formatFilter}
              onChange={(e) => setFormatFilter(e.target.value)}
            >
              <option value="all">All formats</option>
              <option value="pdf">PDF</option>
              <option value="epub">EPUB</option>
            </select>

            <select
              className="input toolbar-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="recent">Recently active</option>
              <option value="title">Title A-Z</option>
              <option value="author">Author A-Z</option>
              <option value="progress">Highest progress</option>
            </select>
          </div>

          <div>
            <div className="section-header">
              <div>
                <h2 className="section-title">Library</h2>
                <p className="section-subtitle">
                  Browse by cover first, then hover or tap to reveal the details.
                </p>
              </div>
            </div>

            {booksError && <p className="error-text">{booksError}</p>}

            {loadingBooks ? (
              <div className="book-grid">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="book-card skeleton-card">
                    <div className="skeleton skeleton-cover" />
                    <div className="skeleton skeleton-line skeleton-line-lg" />
                    <div className="skeleton skeleton-line" />
                    <div className="skeleton skeleton-line" />
                    <div className="skeleton skeleton-line skeleton-line-sm" />
                  </div>
                ))}
              </div>
            ) : filteredBooks.length === 0 ? (
              <div className="empty-state">
                <p>No books match your current filters.</p>
              </div>
            ) : (
              <div className="book-grid">
                {filteredBooks.map((book) => {
                  const percentage = formatPercent(book.progress?.Percentage)
                  const hasProgress = percentage > 0
                  const isCompleted = percentage >= 100

                  return (
                    <div
                      key={book.BookId}
                      className="book-card premium-book-card library-hover-card"
                      onClick={() => openBook(book)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault()
                          openBook(book)
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <BookCover book={book} />

                      <div className="library-card-nameplate">
                        <div className="library-card-name">{book.Title}</div>
                      </div>

                      <div className="library-card-overlay">
                        <h3 className="book-title">{book.Title}</h3>

                        <p className="book-meta">
                          {book.Author || "Unknown"}
                        </p>

                        <button
                          className="text-btn"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            openBookDetails(book, "library")
                          }}
                        >
                          View Details
                        </button>

                        <div className="library-card-cta">
                          {hasProgress && !isCompleted ? "Resume Reading" : "Read Book"}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      {selectedBook && (
        <div
          ref={readerShellRef}
          className={`reader-shell ${isReaderFullscreen ? "reader-shell-fullscreen" : ""}`}
        >
          <div className="reader-header reader-toolbar">
            <div className="reader-toolbar-left">
              <button className="secondary-btn" onClick={closeBook} type="button">
                Back to Library
              </button>

              <div className="reader-heading-block">
                <div className="reader-eyebrow">Reading now</div>
                <h2 className="reader-title">{selectedBook.Title}</h2>
                <p className="reader-meta">
                  {selectedBook.Author || "Unknown"}
                </p>
              </div>
            </div>

            <div className="reader-toolbar-right">
              <button
                className={`secondary-btn ${readerSettingsOpen ? "active-tab" : ""}`}
                onClick={() => setReaderSettingsOpen((prev) => !prev)}
                type="button"
              >
                Settings
              </button>

              <button className="secondary-btn" onClick={toggleFullscreen} type="button">
                {isReaderFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              </button>
            </div>
          </div>

          {readerSettingsOpen && (
            <div className="reader-settings-panel">
              {selectedBook.FileType === "pdf" && (
                <div className="reader-settings-grid">
                  <label className="reader-setting">
                    <span>Zoom</span>
                    <input
                      type="range"
                      min="80"
                      max="150"
                      step="10"
                      value={readerSettings.pdfScale * 100}
                      onChange={(e) =>
                        setReaderSettings((current) => ({
                          ...current,
                          pdfScale: Number(e.target.value) / 100
                        }))
                      }
                    />
                  </label>

                  <label className="reader-setting">
                    <span>Reading surface</span>
                    <select
                      className="input"
                      value={readerSettings.pdfTheme}
                      onChange={(e) =>
                        setReaderSettings((current) => ({
                          ...current,
                          pdfTheme: e.target.value
                        }))
                      }
                    >
                      <option value="dark">Dark</option>
                      <option value="paper">Paper</option>
                    </select>
                  </label>
                </div>
              )}

              {selectedBook.FileType === "epub" && (
                <div className="reader-settings-grid">
                  <label className="reader-setting">
                    <span>Font size</span>
                    <input
                      type="range"
                      min="90"
                      max="140"
                      step="5"
                      value={readerSettings.epubFontSize}
                      onChange={(e) =>
                        setReaderSettings((current) => ({
                          ...current,
                          epubFontSize: Number(e.target.value)
                        }))
                      }
                    />
                  </label>

                  <label className="reader-setting">
                    <span>Line height</span>
                    <input
                      type="range"
                      min="1.4"
                      max="2"
                      step="0.1"
                      value={readerSettings.epubLineHeight}
                      onChange={(e) =>
                        setReaderSettings((current) => ({
                          ...current,
                          epubLineHeight: Number(e.target.value)
                        }))
                      }
                    />
                  </label>

                  <label className="reader-setting">
                    <span>Theme</span>
                    <select
                      className="input"
                      value={readerSettings.epubTheme}
                      onChange={(e) =>
                        setReaderSettings((current) => ({
                          ...current,
                          epubTheme: e.target.value
                        }))
                      }
                    >
                      <option value="paper">Paper</option>
                      <option value="light">Light</option>
                      <option value="sepia">Sepia</option>
                    </select>
                  </label>
                </div>
              )}
            </div>
          )}

          {selectedBook.FileType === "pdf" && (
            <div className="reader-card">
              <div className="reader-controls reader-controls-top">
                <button
                  className="secondary-btn"
                  onClick={goToPreviousPage}
                  disabled={!pdfReady || currentPage <= 1}
                  type="button"
                >
                  Previous
                </button>

                <form className="page-jump-form" onSubmit={handlePdfJumpSubmit}>
                  <span className="page-jump-label">Page</span>
                  <input
                    className="page-jump-input"
                    type="number"
                    min="1"
                    max={numPages || 1}
                    value={pdfPageInput}
                    onChange={(e) => setPdfPageInput(e.target.value)}
                  />
                  <span className="page-jump-total">of {numPages || 0}</span>
                  <button className="secondary-btn" type="submit" disabled={!pdfReady}>
                    Go
                  </button>
                </form>

                <button
                  className="secondary-btn"
                  onClick={goToNextPage}
                  disabled={!pdfReady || currentPage >= numPages}
                  type="button"
                >
                  Next
                </button>

                <div className="progress-text">
                  {readingProgress.percentage
                    ? `${readingProgress.percentage.toFixed(1)}% read`
                    : ""}
                </div>
              </div>

              <div
                ref={pdfWrapRef}
                className={`pdf-wrap pdf-theme-${readerSettings.pdfTheme}`}
              >
                {!pdfReady && (
                  <div className="reader-loading-overlay">
                    <div className="reader-spinner" />
                    <p>Loading PDF...</p>
                  </div>
                )}

                {pdfDocumentFile && (
                  <Document
                    file={pdfDocumentFile}
                    onLoadSuccess={onDocumentLoadSuccess}
                    onLoadError={onDocumentLoadError}
                    loading=""
                    error={<p>Failed to load PDF.</p>}
                    externalLinkTarget="_self"
                  >
                    <Page
                      pageNumber={currentPage}
                      width={Math.round((isReaderFullscreen ? 1000 : 800) * readerSettings.pdfScale)}
                      renderAnnotationLayer={true}
                      renderTextLayer={true}
                    />
                  </Document>
                )}
              </div>
            </div>
          )}

          {selectedBook.FileType === "epub" && (
            <div className="reader-card">
              <EpubReader
                bookId={selectedBook.BookId}
                bookTitle={selectedBook.Title}
                bookAuthor={selectedBook.Author}
                isFullscreen={isReaderFullscreen}
                settings={readerSettings}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default App
