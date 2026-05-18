const express = require("express")
const cors = require("cors")
const multer = require("multer")
const path = require("path")
const { BlobServiceClient } = require("@azure/storage-blob")
const { v4: uuidv4 } = require("uuid")
const { connectDB, sql } = require("./db")
const progressRoutes = require("./routes/progress")
const authRoutes = require("./routes/auth")
const { requireAuth, requireAdmin } = require("./middleware/auth")
require("dotenv").config()

const app = express()
const PORT = process.env.PORT || 5000

const configuredFrontendOrigins = (
  process.env.FRONTEND_ORIGINS ||
  process.env.CLIENT_URL ||
  process.env.FRONTEND_URL ||
  ""
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)

const allowedOrigins = [
  "http://localhost:3000",
  "https://reader-taupe-nu.vercel.app",
  ...configuredFrontendOrigins
]

function isAllowedOrigin(origin) {
  if (!origin) {
    return true
  }

  if (allowedOrigins.includes(origin)) {
    return true
  }

  return /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)
}

app.use((req, res, next) => {
  const origin = req.headers.origin

  if (isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin)
  }

  res.setHeader("Vary", "Origin")
  res.setHeader("Access-Control-Allow-Credentials", "true")
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")

  if (req.method === "OPTIONS") {
    return res.sendStatus(204)
  }

  next()
})

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, true)
        return
      }

      callback(new Error("Origin not allowed by CORS"))
    },
    credentials: true
  })
)

app.use(express.json())

app.use(authRoutes)
app.use(progressRoutes)

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING
const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || "books"
const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString)

const storage = multer.memoryStorage()
const upload = multer({ storage })

const BADGE_CATALOG = [
  {
    code: "staff",
    label: "Staff Pick",
    description: "Part of the OnlineReader team",
    icon: "staff",
    qualifies: (snapshot, profile) => (profile?.Role || "").toLowerCase() === "admin"
  },
  {
    code: "first-book",
    label: "First Book",
    description: "Started your first book",
    icon: "book",
    qualifies: (snapshot) => snapshot.startedBooks >= 1
  },
  {
    code: "finisher",
    label: "Finisher",
    description: "Completed your first book",
    icon: "medal",
    qualifies: (snapshot) => snapshot.completedBooks >= 1
  },
  {
    code: "critic",
    label: "Critic",
    description: "Shared at least 3 ratings or reviews",
    icon: "chat",
    qualifies: (snapshot) => snapshot.reviewsCount >= 3
  },
  {
    code: "collector",
    label: "Collector",
    description: "Built a My List with 5 or more books",
    icon: "bookmark",
    qualifies: (snapshot) => snapshot.myListCount >= 5
  },
  {
    code: "on-a-roll",
    label: "On a Roll",
    description: "Read 3 days in a row",
    icon: "flame",
    qualifies: (snapshot) => snapshot.currentStreak >= 3
  },
  {
    code: "weeklong-streak",
    label: "Weeklong Streak",
    description: "Read for 7 days in a row",
    icon: "crown",
    qualifies: (snapshot) => snapshot.bestStreak >= 7
  },
  {
    code: "followed",
    label: "Followed",
    description: "Gained 3 or more followers",
    icon: "people",
    qualifies: (snapshot) => snapshot.followersCount >= 3
  },
  {
    code: "helpful-voice",
    label: "Helpful Voice",
    description: "Received 5 helpful votes on reviews",
    icon: "spark",
    qualifies: (snapshot) => snapshot.helpfulVotesReceived >= 5
  },
  {
    code: "page-turner",
    label: "Page Turner",
    description: "Completed 5 books",
    icon: "rocket",
    qualifies: (snapshot) => snapshot.completedBooks >= 5
  },
  {
    code: "book-dragon",
    label: "Book Dragon",
    description: "Completed 10 books",
    icon: "dragon",
    qualifies: (snapshot) => snapshot.completedBooks >= 10
  },
  {
    code: "legend-reader",
    label: "Legend Reader",
    description: "Completed 25 books",
    icon: "legend",
    qualifies: (snapshot) => snapshot.completedBooks >= 25
  },
  {
    code: "century-club",
    label: "Century Club",
    description: "Reached level 10",
    icon: "gem",
    qualifies: (snapshot, profile) =>
      calculateLevel(profile?.ExperiencePoints, profile?.BonusLevels).level >= 10
  },
  {
    code: "streak-master",
    label: "Streak Master",
    description: "Reached a 30 day streak",
    icon: "lightning",
    qualifies: (snapshot) => snapshot.bestStreak >= 30
  },
  {
    code: "top-reader",
    label: "Top Reader",
    description: "Ranked #1 on the leaderboard",
    icon: "trophy",
    qualifies: (snapshot) => snapshot.leaderboardRank === 1
  }
]

const TITLE_CATALOG = [
  {
    code: "staff-sentinel",
    label: "Staff Sentinel",
    icon: "staff",
    qualifies: ({ role }) => role === "admin"
  },
  {
    code: "gold-crown",
    label: "Gold Crown",
    icon: "crown",
    qualifies: ({ leaderboardRank }) => leaderboardRank === 1
  },
  {
    code: "silver-crown",
    label: "Silver Crown",
    icon: "medal",
    qualifies: ({ leaderboardRank }) => leaderboardRank === 2
  },
  {
    code: "bronze-crown",
    label: "Bronze Crown",
    icon: "trophy",
    qualifies: ({ leaderboardRank }) => leaderboardRank === 3
  },
  {
    code: "rising-reader",
    label: "Rising Reader",
    icon: "spark",
    qualifies: ({ level }) => level >= 1
  },
  {
    code: "avid-reader",
    label: "Avid Reader",
    icon: "book",
    qualifies: ({ level }) => level >= 5
  },
  {
    code: "storykeeper",
    label: "Storykeeper",
    icon: "bookmark",
    qualifies: ({ level }) => level >= 10
  },
  {
    code: "grand-curator",
    label: "Grand Curator",
    icon: "gem",
    qualifies: ({ level }) => level >= 25
  },
  {
    code: "master-librarian",
    label: "Master Librarian",
    icon: "legend",
    qualifies: ({ level }) => level >= 50
  },
  {
    code: "mythic-archivist",
    label: "Mythic Archivist",
    icon: "dragon",
    qualifies: ({ level }) => level >= 100
  }
]

const ACTIVITY_TYPES_VISIBLE_IN_FEED = [
  "started_book",
  "completed_book",
  "reviewed_book"
]

function isValidCoverFile(fileName) {
  const lower = fileName.toLowerCase()
  return (
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".png") ||
    lower.endsWith(".webp")
  )
}

function getBookFileType(fileName) {
  const lower = fileName.toLowerCase()

  if (lower.endsWith(".pdf")) return "pdf"
  if (lower.endsWith(".epub")) return "epub"
  return null
}

function parseBooleanInput(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback
  }

  if (typeof value === "boolean") {
    return value
  }

  if (typeof value === "number") {
    return value === 1
  }

  const normalized = String(value).trim().toLowerCase()

  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true
  }

  if (["false", "0", "no", "off"].includes(normalized)) {
    return false
  }

  return fallback
}

function parseFeaturedRankInput(value) {
  if (value === undefined || value === null || value === "") {
    return null
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return null
  }

  return Math.max(1, Math.floor(parsed))
}

function normalizePercentage(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return 0
  }

  return Math.max(0, Math.min(100, parsed))
}

function getContainerClient() {
  return blobServiceClient.getContainerClient(containerName)
}

async function getBlobSize(blobPath) {
  if (!blobPath) return 0

  try {
    const blobClient = getContainerClient().getBlobClient(blobPath)
    const properties = await blobClient.getProperties()
    return Number(properties.contentLength || 0)
  } catch (error) {
    console.warn(`Failed to read blob size for ${blobPath}:`, error.message)
    return 0
  }
}

async function deleteBlobIfExists(blobPath) {
  if (!blobPath) return

  try {
    const blobClient = getContainerClient().getBlobClient(blobPath)
    await blobClient.deleteIfExists()
  } catch (error) {
    console.warn(`Failed to delete blob ${blobPath}:`, error.message)
  }
}

async function enrichBooksWithStorage(books) {
  return Promise.all(
    books.map(async (book) => {
      const [fileSizeBytes, coverSizeBytes] = await Promise.all([
        getBlobSize(book.BlobPath),
        getBlobSize(book.CoverImagePath)
      ])

      return {
        ...book,
        IsHidden: !!book.IsHidden,
        IsFeatured: !!book.IsFeatured,
        FeaturedRank: book.FeaturedRank || null,
        AverageCompletionPercentage: normalizePercentage(book.AverageCompletionPercentage),
        FileSizeBytes: fileSizeBytes,
        CoverSizeBytes: coverSizeBytes,
        TotalStorageBytes: fileSizeBytes + coverSizeBytes
      }
    })
  )
}

function buildAdminBookStats(books, totalUsers, totalProgressEntries) {
  const totalStorageBytes = books.reduce(
    (sum, book) => sum + Number(book.TotalStorageBytes || 0),
    0
  )

  const totalBookStorageBytes = books.reduce(
    (sum, book) => sum + Number(book.FileSizeBytes || 0),
    0
  )

  const totalCoverStorageBytes = books.reduce(
    (sum, book) => sum + Number(book.CoverSizeBytes || 0),
    0
  )

  const visibleBooks = books.filter((book) => !book.IsHidden)
  const hiddenBooks = books.filter((book) => book.IsHidden)
  const featuredBooks = books.filter((book) => book.IsFeatured)

  const mostReadBooks = [...books]
    .sort((a, b) => {
      if ((b.ActiveReaders || 0) !== (a.ActiveReaders || 0)) {
        return (b.ActiveReaders || 0) - (a.ActiveReaders || 0)
      }

      return normalizePercentage(b.AverageCompletionPercentage) -
        normalizePercentage(a.AverageCompletionPercentage)
    })
    .slice(0, 5)

  const recentlyUploadedBooks = [...books]
    .sort(
      (a, b) =>
        new Date(b.CreatedAt || 0).getTime() - new Date(a.CreatedAt || 0).getTime()
    )
    .slice(0, 5)

  return {
    TotalBooks: books.length,
    TotalVisibleBooks: visibleBooks.length,
    TotalHiddenBooks: hiddenBooks.length,
    TotalFeaturedBooks: featuredBooks.length,
    TotalUsers: totalUsers,
    TotalProgressEntries: totalProgressEntries,
    TotalStorageBytes: totalStorageBytes,
    TotalBookStorageBytes: totalBookStorageBytes,
    TotalCoverStorageBytes: totalCoverStorageBytes,
    AverageCompletionPercentage: books.length
      ? books.reduce(
          (sum, book) => sum + normalizePercentage(book.AverageCompletionPercentage),
          0
        ) / books.length
      : 0
  }
}

function buildHighlights(books) {
  const mostReadBooks = [...books]
    .sort((a, b) => {
      if ((b.ActiveReaders || 0) !== (a.ActiveReaders || 0)) {
        return (b.ActiveReaders || 0) - (a.ActiveReaders || 0)
      }

      return normalizePercentage(b.AverageCompletionPercentage) -
        normalizePercentage(a.AverageCompletionPercentage)
    })
    .slice(0, 5)

  const recentlyUploadedBooks = [...books]
    .sort(
      (a, b) =>
        new Date(b.CreatedAt || 0).getTime() - new Date(a.CreatedAt || 0).getTime()
    )
    .slice(0, 5)

  return {
    mostReadBooks,
    recentlyUploadedBooks
  }
}

async function fetchBookById(bookId) {
  const result = await sql.query`
    SELECT
      BookId,
      Title,
      Author,
      FileType,
      Description,
      CreatedAt,
      BlobPath,
      CoverImagePath,
      ISNULL(IsHidden, 0) AS IsHidden,
      ISNULL(IsFeatured, 0) AS IsFeatured,
      FeaturedRank
    FROM Books
    WHERE BookId = ${bookId}
  `

  return result.recordset[0] || null
}

function buildDisplayName(email, fallbackUserId = null) {
  if (email && email.includes("@")) {
    return email.split("@")[0]
  }

  return fallbackUserId ? `Reader ${fallbackUserId}` : "Reader"
}

function formatAverageRating(value) {
  const rating = Number(value || 0)

  if (!Number.isFinite(rating) || rating <= 0) {
    return "No ratings yet"
  }

  return Number.isInteger(rating) ? `${rating}/5` : `${rating.toFixed(1)}/5`
}

async function ensureUserProfile(userId, email = null) {
  await sql.query`
    IF NOT EXISTS (SELECT 1 FROM UserProfiles WHERE UserId = ${userId})
    BEGIN
      INSERT INTO UserProfiles (UserId, DisplayName)
      VALUES (${userId}, ${buildDisplayName(email, userId)})
    END
  `
}

async function ensureUserGoals(userId) {
  await sql.query`
    IF NOT EXISTS (SELECT 1 FROM UserGoals WHERE UserId = ${userId})
    BEGIN
      INSERT INTO UserGoals (UserId)
      VALUES (${userId})
    END
  `
}

async function ensureSocialPhase2Schema() {
  await sql.query(`
    IF COL_LENGTH('dbo.UserProfiles', 'AvatarImagePath') IS NULL
    BEGIN
      ALTER TABLE dbo.UserProfiles
      ADD AvatarImagePath NVARCHAR(500) NULL;
    END;

    IF COL_LENGTH('dbo.UserProfiles', 'ExperiencePoints') IS NULL
    BEGIN
      ALTER TABLE dbo.UserProfiles
      ADD ExperiencePoints INT NOT NULL
        CONSTRAINT DF_UserProfiles_ExperiencePoints_Auto DEFAULT 0;
    END;

    IF COL_LENGTH('dbo.UserProfiles', 'BonusLevels') IS NULL
    BEGIN
      ALTER TABLE dbo.UserProfiles
      ADD BonusLevels INT NOT NULL
        CONSTRAINT DF_UserProfiles_BonusLevels_Auto DEFAULT 0;
    END;

    IF OBJECT_ID('dbo.UserBadgeAwards', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.UserBadgeAwards (
        UserId INT NOT NULL,
        BadgeCode NVARCHAR(80) NOT NULL,
        SourceType NVARCHAR(20) NOT NULL CONSTRAINT DF_UserBadgeAwards_SourceType_Auto DEFAULT 'manual',
        IsRevoked BIT NOT NULL CONSTRAINT DF_UserBadgeAwards_IsRevoked_Auto DEFAULT 0,
        AwardedByUserId INT NULL,
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_UserBadgeAwards_CreatedAt_Auto DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_UserBadgeAwards_Auto PRIMARY KEY (UserId, BadgeCode),
        CONSTRAINT FK_UserBadgeAwards_User_Auto FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId),
        CONSTRAINT FK_UserBadgeAwards_Admin_Auto FOREIGN KEY (AwardedByUserId) REFERENCES dbo.Users(UserId)
      );
    END;

    IF COL_LENGTH('dbo.UserBadgeAwards', 'IsRevoked') IS NULL
    BEGIN
      ALTER TABLE dbo.UserBadgeAwards
      ADD IsRevoked BIT NOT NULL
        CONSTRAINT DF_UserBadgeAwards_IsRevoked_Backfill_Auto DEFAULT 0;
    END;
  `)
}

async function ensureSocialPhase3Schema() {
  await sql.query(`
    IF OBJECT_ID('dbo.UserChallengeRewards', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.UserChallengeRewards (
        UserId INT NOT NULL,
        ChallengeCode NVARCHAR(80) NOT NULL,
        AwardedXp INT NOT NULL,
        AwardedAt DATETIME2 NOT NULL CONSTRAINT DF_UserChallengeRewards_Auto_AwardedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_UserChallengeRewards_Auto PRIMARY KEY (UserId, ChallengeCode),
        CONSTRAINT FK_UserChallengeRewards_User_Auto FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId)
      );
    END;

    IF COL_LENGTH('dbo.UserProfiles', 'SelectedTitle') IS NULL
    BEGIN
      ALTER TABLE dbo.UserProfiles
      ADD SelectedTitle NVARCHAR(80) NULL;
    END;
  `)
}

async function awardExperiencePoints(userId, amount) {
  const points = Math.max(0, Number(amount) || 0)

  if (!points) {
    return
  }

  await sql.query`
    UPDATE UserProfiles
    SET ExperiencePoints = ISNULL(ExperiencePoints, 0) + ${points},
        UpdatedAt = SYSUTCDATETIME()
    WHERE UserId = ${userId}
  `
}

async function recordActivity(userId, activityType, options = {}) {
  const { bookId = null, reviewId = null, metadata = null } = options

  await sql.query`
    INSERT INTO UserActivity (UserId, ActivityType, BookId, ReviewId, MetadataJson)
    VALUES (
      ${userId},
      ${activityType},
      ${bookId},
      ${reviewId},
      ${metadata ? JSON.stringify(metadata) : null}
    )
  `
}

function getBadgeDefinition(code) {
  return BADGE_CATALOG.find((badge) => badge.code === code) || null
}

function calculateLevel(experiencePoints, bonusLevels = 0) {
  let xp = Math.max(0, Number(experiencePoints) || 0)
  let level = 1
  let nextThreshold = 100

  while (xp >= nextThreshold) {
    xp -= nextThreshold
    level += 1
    nextThreshold = 100 + (level - 1) * 40
  }

  return {
    level: level + Math.max(0, Number(bonusLevels) || 0),
    currentXpIntoLevel: xp,
    nextLevelXp: nextThreshold,
    progressPercent: nextThreshold ? (xp / nextThreshold) * 100 : 0
  }
}

async function getAwardedBadges(userId) {
  const result = await sql.query`
    SELECT BadgeCode, SourceType, IsRevoked, AwardedByUserId, CreatedAt
    FROM UserBadgeAwards
    WHERE UserId = ${userId}
    ORDER BY CreatedAt DESC
  `

  return result.recordset
}

async function syncAutomaticBadges(userId, snapshot) {
  const existingAwards = await getAwardedBadges(userId)
  const existingBadgeStates = new Map(
    existingAwards.map((badge) => [badge.BadgeCode, badge])
  )
  const missingAutomaticBadges = BADGE_CATALOG.filter(
    (badge) => badge.qualifies(snapshot, snapshot.profile) && !existingBadgeStates.has(badge.code)
  )

  if (missingAutomaticBadges.length > 0) {
    for (const badge of missingAutomaticBadges) {
      await sql.query`
        INSERT INTO UserBadgeAwards (UserId, BadgeCode, SourceType, IsRevoked)
        VALUES (${userId}, ${badge.code}, ${"auto"}, 0)
      `
    }

    await awardExperiencePoints(userId, missingAutomaticBadges.length * 40)
  }

  return [...existingAwards, ...missingAutomaticBadges.map((badge) => ({
    BadgeCode: badge.code,
    SourceType: "auto",
    IsRevoked: false,
    AwardedByUserId: null,
    CreatedAt: new Date().toISOString()
  }))].filter((badge) => !badge.IsRevoked)
}

async function getLeaderboardRankForUser(userId) {
  const result = await sql.query`
    SELECT
      u.UserId,
      ISNULL(up.ExperiencePoints, 0) AS ExperiencePoints,
      ISNULL(up.BonusLevels, 0) AS BonusLevels,
      (
        SELECT COUNT(*)
        FROM ReadingProgress rp
        WHERE rp.UserId = u.UserId
          AND ISNULL(rp.Percentage, 0) >= 100
      ) AS CompletedBooks,
      (
        SELECT ISNULL(SUM(HelpfulCount), 0)
        FROM BookReviews br
        WHERE br.UserId = u.UserId
      ) AS HelpfulVotesReceived
    FROM Users u
    LEFT JOIN UserProfiles up
      ON up.UserId = u.UserId
  `

  const sorted = result.recordset
    .map((row) => ({
      userId: row.UserId,
      level: calculateLevel(row.ExperiencePoints, row.BonusLevels).level,
      experiencePoints: Number(row.ExperiencePoints || 0),
      completedBooks: Number(row.CompletedBooks || 0),
      helpfulVotesReceived: Number(row.HelpfulVotesReceived || 0)
    }))
    .sort((a, b) => {
      if (b.level !== a.level) return b.level - a.level
      if (b.experiencePoints !== a.experiencePoints) {
        return b.experiencePoints - a.experiencePoints
      }
      if (b.completedBooks !== a.completedBooks) {
        return b.completedBooks - a.completedBooks
      }
      return b.helpfulVotesReceived - a.helpfulVotesReceived
    })

  return sorted.findIndex((entry) => entry.userId === userId) + 1
}

async function getLeaderboardRanksMap() {
  const result = await sql.query`
    SELECT
      u.UserId,
      ISNULL(up.ExperiencePoints, 0) AS ExperiencePoints,
      ISNULL(up.BonusLevels, 0) AS BonusLevels,
      (
        SELECT COUNT(*)
        FROM ReadingProgress rp
        WHERE rp.UserId = u.UserId
          AND ISNULL(rp.Percentage, 0) >= 100
      ) AS CompletedBooks,
      (
        SELECT ISNULL(SUM(HelpfulCount), 0)
        FROM BookReviews br
        WHERE br.UserId = u.UserId
      ) AS HelpfulVotesReceived
    FROM Users u
    LEFT JOIN UserProfiles up
      ON up.UserId = u.UserId
  `

  const sorted = result.recordset
    .map((row) => ({
      userId: row.UserId,
      level: calculateLevel(row.ExperiencePoints, row.BonusLevels).level,
      experiencePoints: Number(row.ExperiencePoints || 0),
      completedBooks: Number(row.CompletedBooks || 0),
      helpfulVotesReceived: Number(row.HelpfulVotesReceived || 0)
    }))
    .sort((a, b) => {
      if (b.level !== a.level) return b.level - a.level
      if (b.experiencePoints !== a.experiencePoints) {
        return b.experiencePoints - a.experiencePoints
      }
      if (b.completedBooks !== a.completedBooks) {
        return b.completedBooks - a.completedBooks
      }
      return b.helpfulVotesReceived - a.helpfulVotesReceived
    })

  return new Map(sorted.map((entry, index) => [entry.userId, index + 1]))
}

async function syncChallengeRewards(userId, challenges) {
  const rewardsResult = await sql.query`
    SELECT ChallengeCode
    FROM UserChallengeRewards
    WHERE UserId = ${userId}
  `

  const rewardedCodes = new Set(
    rewardsResult.recordset.map((reward) => reward.ChallengeCode)
  )

  const newRewards = challenges.filter(
    (challenge) => challenge.completed && !rewardedCodes.has(challenge.code)
  )

  for (const challenge of newRewards) {
    await sql.query`
      INSERT INTO UserChallengeRewards (UserId, ChallengeCode, AwardedXp)
      VALUES (${userId}, ${challenge.code}, ${challenge.xpReward})
    `
    await awardExperiencePoints(userId, challenge.xpReward)
  }

  return {
    rewardedCodes: new Set([
      ...rewardedCodes,
      ...newRewards.map((challenge) => challenge.code)
    ]),
    rewardsGranted: newRewards
  }
}

function calculateStreaks(activityDates) {
  const uniqueDates = Array.from(
    new Set(
      activityDates
        .filter(Boolean)
        .map((value) => new Date(value).toISOString().slice(0, 10))
    )
  ).sort()

  if (uniqueDates.length === 0) {
    return { currentStreak: 0, bestStreak: 0, totalActiveDays: 0 }
  }

  let bestStreak = 1
  let runningStreak = 1

  for (let index = 1; index < uniqueDates.length; index += 1) {
    const previous = new Date(uniqueDates[index - 1])
    const current = new Date(uniqueDates[index])
    const diffDays = Math.round((current - previous) / 86400000)

    if (diffDays === 1) {
      runningStreak += 1
      bestStreak = Math.max(bestStreak, runningStreak)
    } else {
      runningStreak = 1
    }
  }

  let currentStreak = 0
  const today = new Date()
  let cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))

  while (uniqueDates.includes(cursor.toISOString().slice(0, 10))) {
    currentStreak += 1
    cursor = new Date(cursor.getTime() - 86400000)
  }

  return {
    currentStreak,
    bestStreak,
    totalActiveDays: uniqueDates.length
  }
}

function buildBadges(awardedBadges) {
  return awardedBadges
    .map((award) => {
      const definition = getBadgeDefinition(award.BadgeCode)

      if (!definition) {
        return null
      }

      return {
        code: definition.code,
        label: definition.label,
        description: definition.description,
        icon: definition.icon,
        sourceType: award.SourceType,
        awardedAt: award.CreatedAt
      }
    })
    .filter(Boolean)
}

function buildUnlockedTitles({ role, level, leaderboardRank }) {
  return TITLE_CATALOG.filter((title) =>
    title.qualifies({
      role: (role || "").toLowerCase(),
      level: Number(level || 1),
      leaderboardRank: Number(leaderboardRank || 0)
    })
  ).map(({ qualifies, ...title }) => title)
}

function resolveActiveTitle(unlockedTitles, selectedTitle) {
  if (!Array.isArray(unlockedTitles) || unlockedTitles.length === 0) {
    return null
  }

  if (selectedTitle) {
    const matchingTitle = unlockedTitles.find((title) => title.code === selectedTitle)
    if (matchingTitle) {
      return matchingTitle
    }
  }

  return unlockedTitles[0]
}

function buildChallenges(snapshot, goals) {
  const weeklyDaysGoal = Math.max(1, Number(goals?.WeeklyReadingDaysGoal || 4))
  const monthlyBooksGoal = Math.max(1, Number(goals?.MonthlyBooksGoal || 2))

  return [
    {
      code: "weekly-rhythm",
      title: "Weekly Reading Rhythm",
      description: `Read on ${weeklyDaysGoal} different days this week`,
      progress: Math.min(snapshot.activeDaysThisWeek, weeklyDaysGoal),
      target: weeklyDaysGoal,
      completed: snapshot.activeDaysThisWeek >= weeklyDaysGoal,
      xpReward: 35
    },
    {
      code: "monthly-finisher",
      title: "Monthly Finisher",
      description: `Finish ${monthlyBooksGoal} books this month`,
      progress: Math.min(snapshot.completedThisMonth, monthlyBooksGoal),
      target: monthlyBooksGoal,
      completed: snapshot.completedThisMonth >= monthlyBooksGoal,
      xpReward: 80
    },
    {
      code: "social-reader",
      title: "Social Reader",
      description: "Follow 3 readers",
      progress: Math.min(snapshot.followingCount, 3),
      target: 3,
      completed: snapshot.followingCount >= 3,
      xpReward: 25
    },
    {
      code: "reviewer",
      title: "Share Your Take",
      description: "Post 2 ratings or reviews",
      progress: Math.min(snapshot.reviewsCount, 2),
      target: 2,
      completed: snapshot.reviewsCount >= 2,
      xpReward: 30
    },
    {
      code: "streak-starter",
      title: "Streak Starter",
      description: "Reach a 7 day reading streak",
      progress: Math.min(snapshot.bestStreak, 7),
      target: 7,
      completed: snapshot.bestStreak >= 7,
      xpReward: 45
    },
    {
      code: "ten-book-push",
      title: "Ten Book Push",
      description: "Complete 10 books total",
      progress: Math.min(snapshot.completedBooks, 10),
      target: 10,
      completed: snapshot.completedBooks >= 10,
      xpReward: 120
    }
  ]
}

async function buildUserCommunitySnapshot(userId) {
  const summaryResult = await sql.query`
    SELECT
      (SELECT COUNT(*) FROM ReadingProgress WHERE UserId = ${userId}) AS ProgressEntries,
      (SELECT COUNT(DISTINCT BookId) FROM ReadingProgress WHERE UserId = ${userId}) AS StartedBooks,
      (SELECT COUNT(*) FROM ReadingProgress WHERE UserId = ${userId} AND ISNULL(Percentage, 0) >= 100) AS CompletedBooks,
      (SELECT COUNT(*) FROM BookReviews WHERE UserId = ${userId}) AS ReviewsCount,
      (SELECT COUNT(*) FROM UserMyList WHERE UserId = ${userId}) AS MyListCount,
      (SELECT COUNT(*) FROM UserFollows WHERE FollowerUserId = ${userId}) AS FollowingCount,
      (SELECT COUNT(*) FROM UserFollows WHERE FollowedUserId = ${userId}) AS FollowersCount,
      (
        SELECT ISNULL(SUM(HelpfulCount), 0)
        FROM BookReviews
        WHERE UserId = ${userId}
      ) AS HelpfulVotesReceived
  `

  const readingDatesResult = await sql.query`
    SELECT UpdatedAt
    FROM ReadingProgress
    WHERE UserId = ${userId}
  `

  const profileResult = await sql.query`
    SELECT
      u.UserId,
      u.Email,
      u.Role,
      up.DisplayName,
      up.Bio,
      up.AvatarUrl,
      up.AvatarImagePath,
      up.UpdatedAt AS ProfileUpdatedAt,
      up.FavoriteGenres,
      up.FavoriteBook,
      up.SelectedTitle,
      ISNULL(up.ExperiencePoints, 0) AS ExperiencePoints,
      ISNULL(up.BonusLevels, 0) AS BonusLevels,
      ug.WeeklyReadingDaysGoal,
      ug.MonthlyBooksGoal
    FROM Users u
    LEFT JOIN UserProfiles up
      ON up.UserId = u.UserId
    LEFT JOIN UserGoals ug
      ON ug.UserId = u.UserId
    WHERE u.UserId = ${userId}
  `

  const recentActivityResult = await sql.query`
    SELECT TOP 10
      ua.ActivityId,
      ua.ActivityType,
      ua.BookId,
      ua.MetadataJson,
      ua.CreatedAt,
      b.Title AS BookTitle,
      u.Role,
      u.Email,
      up.DisplayName
    FROM UserActivity ua
    INNER JOIN Users u
      ON u.UserId = ua.UserId
    LEFT JOIN UserProfiles up
      ON up.UserId = ua.UserId
    LEFT JOIN Books b
      ON CAST(b.BookId AS NVARCHAR(255)) = ua.BookId
    WHERE ua.UserId = ${userId}
    ORDER BY ua.CreatedAt DESC
  `

  const myListPreviewResult = await sql.query`
    SELECT TOP 4
      b.BookId,
      b.Title,
      b.Author,
      b.Description,
      b.FileType,
      b.CreatedAt,
      b.CoverImagePath,
      ISNULL(b.IsFeatured, 0) AS IsFeatured,
      b.FeaturedRank
    FROM UserMyList uml
    INNER JOIN Books b
      ON CAST(b.BookId AS NVARCHAR(255)) = uml.BookId
    WHERE uml.UserId = ${userId}
    ORDER BY uml.CreatedAt DESC
  `

  const summary = summaryResult.recordset[0] || {}
  const profile = profileResult.recordset[0] || null
  const streaks = calculateStreaks(readingDatesResult.recordset.map((row) => row.UpdatedAt))

  const now = new Date()
  const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6))
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const activeDaysThisWeek = new Set(
    readingDatesResult.recordset
      .filter((row) => row.UpdatedAt && new Date(row.UpdatedAt) >= weekStart)
      .map((row) => new Date(row.UpdatedAt).toISOString().slice(0, 10))
  ).size

  const completedThisMonthResult = await sql.query`
    SELECT COUNT(*) AS CompletedThisMonth
    FROM ReadingProgress
    WHERE UserId = ${userId}
      AND ISNULL(Percentage, 0) >= 100
      AND UpdatedAt >= ${monthStart}
  `

  const snapshot = {
    startedBooks: Number(summary.StartedBooks || 0),
    completedBooks: Number(summary.CompletedBooks || 0),
    reviewsCount: Number(summary.ReviewsCount || 0),
    myListCount: Number(summary.MyListCount || 0),
    followingCount: Number(summary.FollowingCount || 0),
    followersCount: Number(summary.FollowersCount || 0),
    helpfulVotesReceived: Number(summary.HelpfulVotesReceived || 0),
    progressEntries: Number(summary.ProgressEntries || 0),
    activeDaysThisWeek,
    completedThisMonth: Number(
      completedThisMonthResult.recordset[0]?.CompletedThisMonth || 0
    ),
    ...streaks
  }

  const preliminaryProfile = {
    ...profile,
    WeeklyReadingDaysGoal: profile?.WeeklyReadingDaysGoal || 4,
    MonthlyBooksGoal: profile?.MonthlyBooksGoal || 2,
    ExperiencePoints: Number(profile?.ExperiencePoints || 0),
    BonusLevels: Number(profile?.BonusLevels || 0)
  }

  snapshot.profile = preliminaryProfile
  snapshot.leaderboardRank = await getLeaderboardRankForUser(userId)

  const awardedBadges = await syncAutomaticBadges(userId, snapshot)
  const challenges = buildChallenges(snapshot, preliminaryProfile)
  const rewardState = await syncChallengeRewards(userId, challenges)
  const refreshedProfileResult = await sql.query`
    SELECT ISNULL(ExperiencePoints, 0) AS ExperiencePoints,
           ISNULL(BonusLevels, 0) AS BonusLevels,
           AvatarImagePath,
           UpdatedAt AS ProfileUpdatedAt
    FROM UserProfiles
    WHERE UserId = ${userId}
  `
  const refreshedProfile = refreshedProfileResult.recordset[0] || {}
  const profileWithDefaults = {
    ...profile,
    WeeklyReadingDaysGoal: profile?.WeeklyReadingDaysGoal || 4,
    MonthlyBooksGoal: profile?.MonthlyBooksGoal || 2,
    AvatarImagePath: refreshedProfile.AvatarImagePath || profile?.AvatarImagePath || null,
    ProfileUpdatedAt: refreshedProfile.ProfileUpdatedAt || profile?.ProfileUpdatedAt || null,
    ExperiencePoints: Number(refreshedProfile.ExperiencePoints ?? profile?.ExperiencePoints ?? 0),
    BonusLevels: Number(refreshedProfile.BonusLevels ?? profile?.BonusLevels ?? 0)
  }
  const level = calculateLevel(
    profileWithDefaults.ExperiencePoints,
    profileWithDefaults.BonusLevels
  )
  const unlockedTitles = buildUnlockedTitles({
    role: profileWithDefaults.Role,
    level: level.level,
    leaderboardRank: snapshot.leaderboardRank
  })
  const activeTitle = resolveActiveTitle(unlockedTitles, profileWithDefaults.SelectedTitle)

  return {
    profile: profileWithDefaults,
    stats: snapshot,
    badges: buildBadges(awardedBadges),
    challenges: challenges.map((challenge) => ({
      ...challenge,
      rewarded: rewardState.rewardedCodes.has(challenge.code)
    })),
    level,
    unlockedTitles,
    activeTitle,
    recentActivity: recentActivityResult.recordset
      .filter((item) => ACTIVITY_TYPES_VISIBLE_IN_FEED.includes(item.ActivityType))
      .map((item) => ({
        ...item,
        metadata: item.MetadataJson ? JSON.parse(item.MetadataJson) : null
      })),
    myListPreview: myListPreviewResult.recordset
  }
}

app.get("/", (req, res) => {
  res.send("Server is running")
})

app.get("/books", requireAuth, async (req, res) => {
  try {
    await connectDB()

    const result = await sql.query(`
      SELECT
        BookId,
        Title,
        Author,
        FileType,
        Description,
        CreatedAt,
        CoverImagePath,
        ISNULL(IsFeatured, 0) AS IsFeatured,
        FeaturedRank
      FROM Books
      WHERE ISNULL(IsHidden, 0) = 0
      ORDER BY
        CASE WHEN ISNULL(IsFeatured, 0) = 1 THEN 0 ELSE 1 END,
        ISNULL(FeaturedRank, 999999),
        CreatedAt DESC
    `)

    res.json(result.recordset)
  } catch (err) {
    console.error("GET /books error:", err)
    res.status(500).json({
      message: "Failed to fetch books",
      error: err.message
    })
  }
})

app.get("/books/library", requireAuth, async (req, res) => {
  try {
    await connectDB()

    const userId = req.user.userId

    const result = await sql.query`
      SELECT
        b.BookId,
        b.Title,
        b.Author,
        b.FileType,
        b.Description,
        b.CreatedAt,
        b.CoverImagePath,
        ISNULL(b.IsFeatured, 0) AS IsFeatured,
        b.FeaturedRank,
        rp.Format,
        rp.ProgressValue,
        rp.Percentage,
        rp.UpdatedAt
      FROM Books b
      LEFT JOIN ReadingProgress rp
        ON rp.BookId = CAST(b.BookId AS NVARCHAR(255))
        AND rp.UserId = ${userId}
      WHERE ISNULL(b.IsHidden, 0) = 0
      ORDER BY
        CASE WHEN ISNULL(b.IsFeatured, 0) = 1 THEN 0 ELSE 1 END,
        ISNULL(b.FeaturedRank, 999999),
        CASE WHEN rp.UpdatedAt IS NULL THEN 1 ELSE 0 END,
        rp.UpdatedAt DESC,
        b.CreatedAt DESC
    `

    const books = result.recordset.map((row) => ({
      BookId: row.BookId,
      Title: row.Title,
      Author: row.Author,
      FileType: row.FileType,
      Description: row.Description,
      CreatedAt: row.CreatedAt,
      CoverImagePath: row.CoverImagePath,
      IsFeatured: !!row.IsFeatured,
      FeaturedRank: row.FeaturedRank || null,
      progress: row.ProgressValue
        ? {
            Format: row.Format,
            ProgressValue: row.ProgressValue,
            Percentage: row.Percentage || 0,
            UpdatedAt: row.UpdatedAt
          }
        : null
    }))

    res.json(books)
  } catch (err) {
    console.error("GET /books/library error:", err)
    res.status(500).json({
      message: "Failed to fetch personalized library",
      error: err.message
    })
  }
})

app.post(
  "/admin/books/upload",
  requireAuth,
  requireAdmin,
  upload.fields([
    { name: "book", maxCount: 1 },
    { name: "coverImage", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const { title, author, description } = req.body
      const isHidden = parseBooleanInput(req.body.isHidden, false)
      const isFeatured = parseBooleanInput(req.body.isFeatured, false)
      const featuredRank = isFeatured
        ? parseFeaturedRankInput(req.body.featuredRank)
        : null
      const bookFile = req.files?.book?.[0]
      const coverImage = req.files?.coverImage?.[0]

      if (!bookFile) {
        return res.status(400).json({ message: "No book file uploaded" })
      }

      if (!title) {
        return res.status(400).json({ message: "Title is required" })
      }

      const fileType = getBookFileType(bookFile.originalname)

      if (!fileType) {
        return res.status(400).json({
          message: "Only PDF and EPUB files are allowed"
        })
      }

      if (coverImage && !isValidCoverFile(coverImage.originalname)) {
        return res.status(400).json({
          message: "Cover image must be JPG, JPEG, PNG, or WEBP"
        })
      }

      let coverImagePath = null
      const bookId = uuidv4()
      const containerClient = getContainerClient()

      const blobName = `books/${bookId}-${Date.now()}-${bookFile.originalname}`
      const blockBlobClient = containerClient.getBlockBlobClient(blobName)

      await blockBlobClient.uploadData(bookFile.buffer, {
        blobHTTPHeaders: {
          blobContentType: bookFile.mimetype
        }
      })

      if (coverImage) {
        const coverBlobName = `covers/${bookId}-${Date.now()}-${coverImage.originalname}`
        const coverBlobClient = containerClient.getBlockBlobClient(coverBlobName)

        await coverBlobClient.uploadData(coverImage.buffer, {
          blobHTTPHeaders: {
            blobContentType: coverImage.mimetype
          }
        })

        coverImagePath = coverBlobName
      }

      await connectDB()

      await sql.query`
        INSERT INTO Books (
          BookId,
          Title,
          Author,
          FileType,
          BlobPath,
          Description,
          CoverImagePath,
          IsHidden,
          IsFeatured,
          FeaturedRank
        )
        VALUES (
          ${bookId},
          ${title},
          ${author || null},
          ${fileType},
          ${blobName},
          ${description || null},
          ${coverImagePath},
          ${isHidden},
          ${isFeatured},
          ${featuredRank}
        )
      `

      res.json({
        message: "Book uploaded and saved successfully",
        bookId,
        blobPath: blobName,
        coverImagePath
      })
    } catch (err) {
      console.error("POST /admin/books/upload error:", err)
      res.status(500).json({
        message: "Upload failed",
        error: err.message
      })
    }
  }
)

app.get("/admin/books", requireAuth, requireAdmin, async (req, res) => {
  try {
    await connectDB()

    const booksResult = await sql.query(`
      SELECT
        b.BookId,
        b.Title,
        b.Author,
        b.FileType,
        b.Description,
        b.CreatedAt,
        b.BlobPath,
        b.CoverImagePath,
        ISNULL(b.IsHidden, 0) AS IsHidden,
        ISNULL(b.IsFeatured, 0) AS IsFeatured,
        b.FeaturedRank,
        COUNT(rp.Id) AS ProgressEntries,
        COUNT(DISTINCT rp.UserId) AS ActiveReaders,
        SUM(CASE WHEN ISNULL(rp.Percentage, 0) >= 100 THEN 1 ELSE 0 END) AS CompletedReaders,
        AVG(CAST(ISNULL(rp.Percentage, 0) AS FLOAT)) AS AverageCompletionPercentage
      FROM Books b
      LEFT JOIN ReadingProgress rp
        ON rp.BookId = CAST(b.BookId AS NVARCHAR(255))
      GROUP BY
        b.BookId,
        b.Title,
        b.Author,
        b.FileType,
        b.Description,
        b.CreatedAt,
        b.BlobPath,
        b.CoverImagePath,
        b.IsHidden,
        b.IsFeatured,
        b.FeaturedRank
      ORDER BY
        CASE WHEN ISNULL(b.IsFeatured, 0) = 1 THEN 0 ELSE 1 END,
        ISNULL(b.FeaturedRank, 999999),
        b.CreatedAt DESC
    `)

    const totalsResult = await sql.query(`
      SELECT
        (SELECT COUNT(*) FROM Users) AS TotalUsers,
        (SELECT COUNT(*) FROM ReadingProgress) AS TotalProgressEntries
    `)

    const books = await enrichBooksWithStorage(booksResult.recordset)
    const totals = totalsResult.recordset[0]
    const stats = buildAdminBookStats(
      books,
      totals.TotalUsers || 0,
      totals.TotalProgressEntries || 0
    )
    const highlights = buildHighlights(books)

    res.json({
      books,
      stats,
      highlights
    })
  } catch (err) {
    console.error("GET /admin/books error:", err)
    res.status(500).json({
      message: "Failed to fetch admin books",
      error: err.message
    })
  }
})

app.get("/admin/books/:id/readers", requireAuth, requireAdmin, async (req, res) => {
  try {
    const bookId = req.params.id

    await connectDB()

    const book = await fetchBookById(bookId)

    if (!book) {
      return res.status(404).json({ message: "Book not found" })
    }

    const readersResult = await sql.query`
      SELECT
        u.UserId,
        u.Email,
        u.Role,
        rp.Format,
        rp.ProgressValue,
        rp.Percentage,
        rp.UpdatedAt
      FROM ReadingProgress rp
      INNER JOIN Users u
        ON u.UserId = rp.UserId
      WHERE rp.BookId = ${bookId}
      ORDER BY
        CASE WHEN rp.Percentage IS NULL THEN 1 ELSE 0 END,
        rp.Percentage DESC,
        rp.UpdatedAt DESC
    `

    res.json({
      book,
      readers: readersResult.recordset
    })
  } catch (err) {
    console.error("GET /admin/books/:id/readers error:", err)
    res.status(500).json({
      message: "Failed to fetch book reader details",
      error: err.message
    })
  }
})

app.post("/admin/books/bulk", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { action, bookIds, featuredRank } = req.body

    if (!Array.isArray(bookIds) || bookIds.length === 0) {
      return res.status(400).json({ message: "Select at least one book" })
    }

    const validActions = ["delete", "hide", "unhide", "feature", "unfeature"]

    if (!validActions.includes(action)) {
      return res.status(400).json({ message: "Invalid bulk action" })
    }

    await connectDB()

    for (const bookId of bookIds) {
      if (action === "delete") {
        const book = await fetchBookById(bookId)

        await sql.query`
          DELETE FROM ReadingProgress
          WHERE BookId = ${bookId}
        `

        await sql.query`
          DELETE FROM Books
          WHERE BookId = ${bookId}
        `

        if (book) {
          await Promise.all([
            deleteBlobIfExists(book.BlobPath),
            deleteBlobIfExists(book.CoverImagePath)
          ])
        }

        continue
      }

      if (action === "hide" || action === "unhide") {
        await sql.query`
          UPDATE Books
          SET IsHidden = ${action === "hide"}
          WHERE BookId = ${bookId}
        `
        continue
      }

      if (action === "feature" || action === "unfeature") {
        await sql.query`
          UPDATE Books
          SET
            IsFeatured = ${action === "feature"},
            FeaturedRank = ${action === "feature" ? parseFeaturedRankInput(featuredRank) : null}
          WHERE BookId = ${bookId}
        `
      }
    }

    res.json({
      message: `Bulk action "${action}" completed successfully`
    })
  } catch (err) {
    console.error("POST /admin/books/bulk error:", err)
    res.status(500).json({
      message: "Failed to run bulk action",
      error: err.message
    })
  }
})

app.put("/admin/books/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { title, author, description } = req.body
    const bookId = req.params.id

    if (!title) {
      return res.status(400).json({ message: "Title is required" })
    }

    await connectDB()

    await sql.query`
      UPDATE Books
      SET
        Title = ${title},
        Author = ${author || null},
        Description = ${description || null}
      WHERE BookId = ${bookId}
    `

    res.json({ message: "Book metadata updated successfully" })
  } catch (err) {
    console.error("PUT /admin/books/:id error:", err)
    res.status(500).json({
      message: "Failed to update book",
      error: err.message
    })
  }
})

app.patch("/admin/books/:id/settings", requireAuth, requireAdmin, async (req, res) => {
  try {
    const bookId = req.params.id
    const isHidden = parseBooleanInput(req.body.isHidden, false)
    const isFeatured = parseBooleanInput(req.body.isFeatured, false)
    const featuredRank = isFeatured
      ? parseFeaturedRankInput(req.body.featuredRank)
      : null

    await connectDB()

    await sql.query`
      UPDATE Books
      SET
        IsHidden = ${isHidden},
        IsFeatured = ${isFeatured},
        FeaturedRank = ${featuredRank}
      WHERE BookId = ${bookId}
    `

    res.json({
      message: "Book settings updated successfully"
    })
  } catch (err) {
    console.error("PATCH /admin/books/:id/settings error:", err)
    res.status(500).json({
      message: "Failed to update book settings",
      error: err.message
    })
  }
})

app.put(
  "/admin/books/:id/cover",
  requireAuth,
  requireAdmin,
  upload.single("coverImage"),
  async (req, res) => {
    try {
      const bookId = req.params.id
      const coverImage = req.file

      if (!coverImage) {
        return res.status(400).json({ message: "No cover image uploaded" })
      }

      if (!isValidCoverFile(coverImage.originalname)) {
        return res.status(400).json({
          message: "Cover image must be JPG, JPEG, PNG, or WEBP"
        })
      }

      await connectDB()

      const existing = await fetchBookById(bookId)

      if (!existing) {
        return res.status(404).json({ message: "Book not found" })
      }

      const coverBlobName = `covers/${bookId}-${Date.now()}-${coverImage.originalname}`
      const coverBlobClient = getContainerClient().getBlockBlobClient(coverBlobName)

      await coverBlobClient.uploadData(coverImage.buffer, {
        blobHTTPHeaders: {
          blobContentType: coverImage.mimetype
        }
      })

      await sql.query`
        UPDATE Books
        SET CoverImagePath = ${coverBlobName}
        WHERE BookId = ${bookId}
      `

      await deleteBlobIfExists(existing.CoverImagePath)

      res.json({
        message: "Cover replaced successfully",
        coverImagePath: coverBlobName
      })
    } catch (err) {
      console.error("PUT /admin/books/:id/cover error:", err)
      res.status(500).json({
        message: "Failed to replace cover",
        error: err.message
      })
    }
  }
)

app.put(
  "/admin/books/:id/file",
  requireAuth,
  requireAdmin,
  upload.single("book"),
  async (req, res) => {
    try {
      const bookId = req.params.id
      const bookFile = req.file

      if (!bookFile) {
        return res.status(400).json({ message: "No replacement file uploaded" })
      }

      const fileType = getBookFileType(bookFile.originalname)

      if (!fileType) {
        return res.status(400).json({
          message: "Only PDF and EPUB files are allowed"
        })
      }

      await connectDB()

      const existing = await fetchBookById(bookId)

      if (!existing) {
        return res.status(404).json({ message: "Book not found" })
      }

      const blobName = `books/${bookId}-${Date.now()}-${bookFile.originalname}`
      const blockBlobClient = getContainerClient().getBlockBlobClient(blobName)

      await blockBlobClient.uploadData(bookFile.buffer, {
        blobHTTPHeaders: {
          blobContentType: bookFile.mimetype
        }
      })

      await sql.query`
        UPDATE Books
        SET
          BlobPath = ${blobName},
          FileType = ${fileType}
        WHERE BookId = ${bookId}
      `

      await deleteBlobIfExists(existing.BlobPath)

      res.json({
        message: "Book file replaced successfully",
        blobPath: blobName,
        fileType
      })
    } catch (err) {
      console.error("PUT /admin/books/:id/file error:", err)
      res.status(500).json({
        message: "Failed to replace book file",
        error: err.message
      })
    }
  }
)

app.delete("/admin/books/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const bookId = req.params.id

    await connectDB()

    const book = await fetchBookById(bookId)

    await sql.query`
      DELETE FROM ReadingProgress
      WHERE BookId = ${bookId}
    `

    await sql.query`
      DELETE FROM Books
      WHERE BookId = ${bookId}
    `

    if (book) {
      await Promise.all([
        deleteBlobIfExists(book.BlobPath),
        deleteBlobIfExists(book.CoverImagePath)
      ])
    }

    res.json({ message: "Book deleted successfully" })
  } catch (err) {
    console.error("DELETE /admin/books/:id error:", err)
    res.status(500).json({
      message: "Failed to delete book",
      error: err.message
    })
  }
})

app.get("/admin/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    await connectDB()
    await ensureSocialPhase2Schema()
    await ensureSocialPhase3Schema()

    const usersResult = await sql.query`
      SELECT
        u.UserId,
        u.Email,
        u.Role,
        up.DisplayName,
        up.AvatarUrl,
        up.AvatarImagePath,
        up.UpdatedAt AS ProfileUpdatedAt,
        ISNULL(up.ExperiencePoints, 0) AS ExperiencePoints,
        ISNULL(up.BonusLevels, 0) AS BonusLevels,
        (
          SELECT COUNT(*)
          FROM UserBadgeAwards uba
          WHERE uba.UserId = u.UserId
            AND ISNULL(uba.IsRevoked, 0) = 0
        ) AS BadgeCount,
        (
          SELECT COUNT(*)
          FROM ReadingProgress rp
          WHERE rp.UserId = u.UserId
        ) AS ProgressEntries,
        (
          SELECT COUNT(DISTINCT rp.BookId)
          FROM ReadingProgress rp
          WHERE rp.UserId = u.UserId
        ) AS StartedBooks,
        (
          SELECT COUNT(*)
          FROM ReadingProgress rp
          WHERE rp.UserId = u.UserId
            AND ISNULL(rp.Percentage, 0) >= 100
        ) AS CompletedBooks,
        (
          SELECT MAX(rp.UpdatedAt)
          FROM ReadingProgress rp
          WHERE rp.UserId = u.UserId
        ) AS LastActivityAt
      FROM Users u
      LEFT JOIN UserProfiles up
        ON up.UserId = u.UserId
      ORDER BY
        CASE WHEN u.Role = 'admin' THEN 0 ELSE 1 END,
        u.Email ASC
    `

    const statsResult = await sql.query`
      SELECT
        COUNT(*) AS TotalUsers,
        SUM(CASE WHEN Role = 'admin' THEN 1 ELSE 0 END) AS TotalAdmins,
        SUM(CASE WHEN Role = 'user' THEN 1 ELSE 0 END) AS TotalStandardUsers
      FROM Users
    `

    res.json({
      users: usersResult.recordset,
      stats: statsResult.recordset[0]
    })
  } catch (err) {
    console.error("GET /admin/users error:", err)
    res.status(500).json({
      message: "Failed to fetch users",
      error: err.message
    })
  }
})

app.get("/admin/badges", requireAuth, requireAdmin, async (req, res) => {
  await ensureSocialPhase2Schema()
  await ensureSocialPhase3Schema()
  res.json({
    badges: BADGE_CATALOG.map(({ qualifies, ...badge }) => badge)
  })
})

app.put("/admin/users/:id/role", requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.id)
    const { role } = req.body

    if (!Number.isInteger(userId)) {
      return res.status(400).json({ message: "Invalid user id" })
    }

    if (!["admin", "user"].includes(role)) {
      return res.status(400).json({ message: "Role must be admin or user" })
    }

    if (req.user.userId === userId && role !== "admin") {
      return res.status(400).json({
        message: "You cannot remove your own admin access"
      })
    }

    await connectDB()

    const existing = await sql.query`
      SELECT UserId
      FROM Users
      WHERE UserId = ${userId}
    `

    if (existing.recordset.length === 0) {
      return res.status(404).json({ message: "User not found" })
    }

    await sql.query`
      UPDATE Users
      SET Role = ${role}
      WHERE UserId = ${userId}
    `

    res.json({
      message: `User role updated to ${role}`,
      userId,
      role
    })
  } catch (err) {
    console.error("PUT /admin/users/:id/role error:", err)
    res.status(500).json({
      message: "Failed to update user role",
      error: err.message
    })
  }
})

app.put("/admin/users/:id/gamification", requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.id)
    const experiencePoints = Math.max(0, Number(req.body.experiencePoints || 0))
    const bonusLevels = Math.max(0, Number(req.body.bonusLevels || 0))

    if (!Number.isInteger(userId)) {
      return res.status(400).json({ message: "Invalid user id" })
    }

    await connectDB()
    await ensureSocialPhase2Schema()
    await ensureSocialPhase3Schema()

    const existing = await sql.query`
      SELECT UserId, Email
      FROM Users
      WHERE UserId = ${userId}
    `

    if (existing.recordset.length === 0) {
      return res.status(404).json({ message: "User not found" })
    }

    await ensureUserProfile(userId, existing.recordset[0].Email)

    await sql.query`
      UPDATE UserProfiles
      SET ExperiencePoints = ${experiencePoints},
          BonusLevels = ${bonusLevels},
          UpdatedAt = SYSUTCDATETIME()
      WHERE UserId = ${userId}
    `

    res.json({ message: "Gamification updated successfully" })
  } catch (err) {
    console.error("PUT /admin/users/:id/gamification error:", err)
    res.status(500).json({
      message: "Failed to update gamification",
      error: err.message
    })
  }
})

app.post("/admin/users/:id/badges", requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.id)
    const badgeCode = String(req.body.badgeCode || "")
    const badge = getBadgeDefinition(badgeCode)

    if (!Number.isInteger(userId)) {
      return res.status(400).json({ message: "Invalid user id" })
    }

    if (!badge) {
      return res.status(400).json({ message: "Unknown badge code" })
    }

    await connectDB()
    await ensureSocialPhase2Schema()
    await ensureSocialPhase3Schema()

    const existing = await sql.query`
      SELECT UserId, Email
      FROM Users
      WHERE UserId = ${userId}
    `

    if (existing.recordset.length === 0) {
      return res.status(404).json({ message: "User not found" })
    }

    await ensureUserProfile(userId, existing.recordset[0].Email)

    const badgeState = await sql.query`
      SELECT BadgeCode, IsRevoked
      FROM UserBadgeAwards
      WHERE UserId = ${userId}
        AND BadgeCode = ${badgeCode}
    `

    if (badgeState.recordset.length === 0) {
      await sql.query`
        INSERT INTO UserBadgeAwards (UserId, BadgeCode, SourceType, IsRevoked, AwardedByUserId)
        VALUES (${userId}, ${badgeCode}, ${"manual"}, 0, ${req.user.userId})
      `
      await awardExperiencePoints(userId, 40)
    } else {
      if (badgeState.recordset[0].IsRevoked) {
        await awardExperiencePoints(userId, 40)
      }

      await sql.query`
        UPDATE UserBadgeAwards
        SET IsRevoked = 0,
            SourceType = ${"manual"},
            AwardedByUserId = ${req.user.userId},
            CreatedAt = SYSUTCDATETIME()
        WHERE UserId = ${userId}
          AND BadgeCode = ${badgeCode}
      `
    }

    res.json({ message: "Badge granted successfully" })
  } catch (err) {
    console.error("POST /admin/users/:id/badges error:", err)
    res.status(500).json({
      message: "Failed to grant badge",
      error: err.message
    })
  }
})

app.delete("/admin/users/:id/badges/:badgeCode", requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.id)
    const badgeCode = String(req.params.badgeCode || "")

    if (!Number.isInteger(userId)) {
      return res.status(400).json({ message: "Invalid user id" })
    }

    await connectDB()
    await ensureSocialPhase2Schema()
    await ensureSocialPhase3Schema()

    await sql.query`
      UPDATE UserBadgeAwards
      SET IsRevoked = 1,
          AwardedByUserId = ${req.user.userId}
      WHERE UserId = ${userId}
        AND BadgeCode = ${badgeCode}
    `

    await sql.query`
      UPDATE UserProfiles
      SET ExperiencePoints = CASE
            WHEN ISNULL(ExperiencePoints, 0) >= 40 THEN ExperiencePoints - 40
            ELSE 0
          END,
          UpdatedAt = SYSUTCDATETIME()
      WHERE UserId = ${userId}
    `

    res.json({ message: "Badge removed successfully" })
  } catch (err) {
    console.error("DELETE /admin/users/:id/badges/:badgeCode error:", err)
    res.status(500).json({
      message: "Failed to remove badge",
      error: err.message
    })
  }
})

app.put("/admin/reviews/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const reviewId = Number(req.params.id)
    const rating = Number(req.body.rating)
    const comment = req.body.comment || null

    if (!Number.isInteger(reviewId)) {
      return res.status(400).json({ message: "Invalid review id" })
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" })
    }

    await connectDB()

    await sql.query`
      UPDATE BookReviews
      SET Rating = ${rating},
          Comment = ${comment},
          UpdatedAt = SYSUTCDATETIME()
      WHERE ReviewId = ${reviewId}
    `

    res.json({ message: "Review updated successfully" })
  } catch (err) {
    console.error("PUT /admin/reviews/:id error:", err)
    res.status(500).json({
      message: "Failed to update review",
      error: err.message
    })
  }
})

app.delete("/admin/reviews/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const reviewId = Number(req.params.id)

    if (!Number.isInteger(reviewId)) {
      return res.status(400).json({ message: "Invalid review id" })
    }

    await connectDB()

    await sql.query`
      DELETE FROM ReviewHelpfulVotes
      WHERE ReviewId = ${reviewId}
    `

    await sql.query`
      DELETE FROM UserActivity
      WHERE ReviewId = ${reviewId}
    `

    await sql.query`
      DELETE FROM BookReviews
      WHERE ReviewId = ${reviewId}
    `

    res.json({ message: "Review deleted successfully" })
  } catch (err) {
    console.error("DELETE /admin/reviews/:id error:", err)
    res.status(500).json({
      message: "Failed to delete review",
      error: err.message
    })
  }
})

app.get("/profile/me", requireAuth, async (req, res) => {
  try {
    await connectDB()
    await ensureSocialPhase2Schema()
    await ensureSocialPhase3Schema()
    await ensureUserProfile(req.user.userId, req.user.email)
    await ensureUserGoals(req.user.userId)

    const snapshot = await buildUserCommunitySnapshot(req.user.userId)

    res.json({
      ...snapshot,
      isCurrentUser: true,
      isFollowing: false
    })
  } catch (err) {
    console.error("GET /profile/me error:", err)
    res.status(500).json({
      message: "Failed to load profile",
      error: err.message
    })
  }
})

app.put("/profile/me", requireAuth, async (req, res) => {
  try {
    const { displayName, bio, avatarUrl, favoriteGenres, favoriteBook, selectedTitle } = req.body

    await connectDB()
    await ensureSocialPhase2Schema()
    await ensureSocialPhase3Schema()
    await ensureUserProfile(req.user.userId, req.user.email)

    const snapshot = await buildUserCommunitySnapshot(req.user.userId)
    const unlockedTitleCodes = new Set(
      (snapshot.unlockedTitles || []).map((title) => title.code)
    )
    const normalizedSelectedTitle =
      typeof selectedTitle === "string" && unlockedTitleCodes.has(selectedTitle)
        ? selectedTitle
        : null

    await sql.query`
      UPDATE UserProfiles
      SET
        DisplayName = ${displayName || buildDisplayName(req.user.email, req.user.userId)},
        Bio = ${bio || null},
        AvatarUrl = ${avatarUrl || null},
        FavoriteGenres = ${favoriteGenres || null},
        FavoriteBook = ${favoriteBook || null},
        SelectedTitle = ${normalizedSelectedTitle},
        UpdatedAt = SYSUTCDATETIME()
      WHERE UserId = ${req.user.userId}
    `

    res.json({ message: "Profile updated successfully" })
  } catch (err) {
    console.error("PUT /profile/me error:", err)
    res.status(500).json({
      message: "Failed to update profile",
      error: err.message
    })
  }
})

app.put(
  "/profile/me/avatar",
  requireAuth,
  upload.single("avatar"),
  async (req, res) => {
    try {
      const avatarFile = req.file

      if (!avatarFile) {
        return res.status(400).json({ message: "Avatar image is required" })
      }

      if (!isValidCoverFile(avatarFile.originalname)) {
        return res.status(400).json({
          message: "Avatar must be a JPG, PNG, or WEBP image"
        })
      }

      await connectDB()
      await ensureSocialPhase2Schema()
      await ensureSocialPhase3Schema()
      await ensureUserProfile(req.user.userId, req.user.email)

      const existingResult = await sql.query`
        SELECT AvatarImagePath
        FROM UserProfiles
        WHERE UserId = ${req.user.userId}
      `

      const avatarExtension = path.extname(avatarFile.originalname || "").toLowerCase() || ".jpg"
      const avatarBlobPath = `avatars/${uuidv4()}${avatarExtension}`
      const blockBlobClient = getContainerClient().getBlockBlobClient(avatarBlobPath)

      await blockBlobClient.uploadData(avatarFile.buffer, {
        blobHTTPHeaders: {
          blobContentType: avatarFile.mimetype || "image/jpeg"
        }
      })

      await sql.query`
        UPDATE UserProfiles
        SET AvatarImagePath = ${avatarBlobPath},
            AvatarUrl = NULL,
            UpdatedAt = SYSUTCDATETIME()
        WHERE UserId = ${req.user.userId}
      `

      await deleteBlobIfExists(existingResult.recordset[0]?.AvatarImagePath)

      res.json({
        message: "Avatar uploaded successfully",
        avatarUrl: `/profiles/${req.user.userId}/avatar`
      })
    } catch (err) {
      console.error("PUT /profile/me/avatar error:", err)
      res.status(500).json({
        message: "Failed to upload avatar",
        error: err.message
      })
    }
  }
)

app.put("/profile/me/goals", requireAuth, async (req, res) => {
  try {
    const weeklyReadingDaysGoal = Math.max(1, Number(req.body.weeklyReadingDaysGoal || 4))
    const monthlyBooksGoal = Math.max(1, Number(req.body.monthlyBooksGoal || 2))

    await connectDB()
    await ensureSocialPhase2Schema()
    await ensureSocialPhase3Schema()
    await ensureUserGoals(req.user.userId)

    await sql.query`
      UPDATE UserGoals
      SET
        WeeklyReadingDaysGoal = ${weeklyReadingDaysGoal},
        MonthlyBooksGoal = ${monthlyBooksGoal},
        UpdatedAt = SYSUTCDATETIME()
      WHERE UserId = ${req.user.userId}
    `

    res.json({ message: "Goals updated successfully" })
  } catch (err) {
    console.error("PUT /profile/me/goals error:", err)
    res.status(500).json({
      message: "Failed to update goals",
      error: err.message
    })
  }
})

app.get("/profiles/:id", requireAuth, async (req, res) => {
  try {
    const profileUserId = Number(req.params.id)

    if (!Number.isInteger(profileUserId)) {
      return res.status(400).json({ message: "Invalid profile id" })
    }

    await connectDB()
    await ensureSocialPhase2Schema()
    await ensureSocialPhase3Schema()

    const userResult = await sql.query`
      SELECT UserId, Email
      FROM Users
      WHERE UserId = ${profileUserId}
    `

    if (userResult.recordset.length === 0) {
      return res.status(404).json({ message: "Profile not found" })
    }

    await ensureUserProfile(profileUserId, userResult.recordset[0].Email)
    await ensureUserGoals(profileUserId)

    const snapshot = await buildUserCommunitySnapshot(profileUserId)
    const followResult = await sql.query`
      SELECT COUNT(*) AS IsFollowing
      FROM UserFollows
      WHERE FollowerUserId = ${req.user.userId}
        AND FollowedUserId = ${profileUserId}
    `

    res.json({
      ...snapshot,
      isCurrentUser: req.user.userId === profileUserId,
      isFollowing: Number(followResult.recordset[0]?.IsFollowing || 0) > 0
    })
  } catch (err) {
    console.error("GET /profiles/:id error:", err)
    res.status(500).json({
      message: "Failed to load public profile",
      error: err.message
    })
  }
})

app.get("/profiles/:id/avatar", async (req, res) => {
  try {
    const profileUserId = Number(req.params.id)

    if (!Number.isInteger(profileUserId)) {
      return res.status(400).json({ message: "Invalid profile id" })
    }

    await connectDB()
    await ensureSocialPhase2Schema()
    await ensureSocialPhase3Schema()

    const result = await sql.query`
      SELECT AvatarImagePath
      FROM UserProfiles
      WHERE UserId = ${profileUserId}
    `

    const avatarPath = result.recordset[0]?.AvatarImagePath

    if (!avatarPath) {
      return res.status(404).json({ message: "No avatar found" })
    }

    const blobClient = getContainerClient().getBlobClient(avatarPath)
    const [downloadResponse, properties] = await Promise.all([
      blobClient.download(),
      blobClient.getProperties()
    ])

    res.setHeader("Content-Disposition", "inline")
    res.setHeader("Cache-Control", "no-store")
    res.setHeader("Content-Type", properties.contentType || downloadResponse.contentType || "image/jpeg")
    downloadResponse.readableStreamBody.pipe(res)
  } catch (err) {
    console.error("GET /profiles/:id/avatar error:", err)
    res.status(500).json({
      message: "Failed to load avatar",
      error: err.message
    })
  }
})

app.get("/my-list", requireAuth, async (req, res) => {
  try {
    await connectDB()

    const result = await sql.query`
      SELECT
        b.BookId,
        b.Title,
        b.Author,
        b.FileType,
        b.Description,
        b.CreatedAt,
        b.CoverImagePath,
        ISNULL(b.IsFeatured, 0) AS IsFeatured,
        b.FeaturedRank,
        uml.CreatedAt AS SavedAt,
        rp.Format,
        rp.ProgressValue,
        rp.Percentage,
        rp.UpdatedAt
      FROM UserMyList uml
      INNER JOIN Books b
        ON CAST(b.BookId AS NVARCHAR(255)) = uml.BookId
      LEFT JOIN ReadingProgress rp
        ON rp.BookId = uml.BookId
        AND rp.UserId = ${req.user.userId}
      WHERE uml.UserId = ${req.user.userId}
        AND ISNULL(b.IsHidden, 0) = 0
      ORDER BY uml.CreatedAt DESC
    `

    res.json(
      result.recordset.map((row) => ({
        BookId: row.BookId,
        Title: row.Title,
        Author: row.Author,
        FileType: row.FileType,
        Description: row.Description,
        CreatedAt: row.CreatedAt,
        CoverImagePath: row.CoverImagePath,
        IsFeatured: !!row.IsFeatured,
        FeaturedRank: row.FeaturedRank || null,
        SavedAt: row.SavedAt,
        progress: row.ProgressValue
          ? {
              Format: row.Format,
              ProgressValue: row.ProgressValue,
              Percentage: row.Percentage || 0,
              UpdatedAt: row.UpdatedAt
            }
          : null
      }))
    )
  } catch (err) {
    console.error("GET /my-list error:", err)
    res.status(500).json({
      message: "Failed to load My List",
      error: err.message
    })
  }
})

app.post("/books/:id/my-list", requireAuth, async (req, res) => {
  try {
    const bookId = req.params.id

    await connectDB()

    await sql.query`
      IF NOT EXISTS (
        SELECT 1
        FROM UserMyList
        WHERE UserId = ${req.user.userId}
          AND BookId = ${bookId}
      )
      BEGIN
        INSERT INTO UserMyList (UserId, BookId)
        VALUES (${req.user.userId}, ${bookId})
      END
    `

    res.json({ message: "Added to My List" })
  } catch (err) {
    console.error("POST /books/:id/my-list error:", err)
    res.status(500).json({
      message: "Failed to add to My List",
      error: err.message
    })
  }
})

app.delete("/books/:id/my-list", requireAuth, async (req, res) => {
  try {
    await connectDB()

    await sql.query`
      DELETE FROM UserMyList
      WHERE UserId = ${req.user.userId}
        AND BookId = ${req.params.id}
    `

    res.json({ message: "Removed from My List" })
  } catch (err) {
    console.error("DELETE /books/:id/my-list error:", err)
    res.status(500).json({
      message: "Failed to remove from My List",
      error: err.message
    })
  }
})

app.get("/books/:id/reviews", requireAuth, async (req, res) => {
  try {
    const bookId = req.params.id

    await connectDB()
    await ensureSocialPhase2Schema()
    await ensureSocialPhase3Schema()
    const leaderboardRanks = await getLeaderboardRanksMap()

    const reviewsResult = await sql.query`
      SELECT
        br.ReviewId,
        br.UserId,
        br.BookId,
        br.Rating,
        br.Comment,
        br.HelpfulCount,
        br.CreatedAt,
        br.UpdatedAt,
        u.Email,
        u.Role,
        up.DisplayName,
        up.AvatarUrl,
        up.AvatarImagePath,
        up.SelectedTitle,
        up.UpdatedAt AS ProfileUpdatedAt,
        ISNULL(up.ExperiencePoints, 0) AS ExperiencePoints,
        ISNULL(up.BonusLevels, 0) AS BonusLevels,
        CASE
          WHEN rhv.UserId IS NULL THEN CAST(0 AS BIT)
          ELSE CAST(1 AS BIT)
        END AS HelpfulByCurrentUser
      FROM BookReviews br
      INNER JOIN Users u
        ON u.UserId = br.UserId
      LEFT JOIN UserProfiles up
        ON up.UserId = br.UserId
      LEFT JOIN ReviewHelpfulVotes rhv
        ON rhv.ReviewId = br.ReviewId
        AND rhv.UserId = ${req.user.userId}
      WHERE br.BookId = ${bookId}
      ORDER BY br.HelpfulCount DESC, br.UpdatedAt DESC
    `

    const summaryResult = await sql.query`
      SELECT
        COUNT(*) AS ReviewCount,
        AVG(CAST(Rating AS FLOAT)) AS AverageRating
      FROM BookReviews
      WHERE BookId = ${bookId}
    `

    const currentUserReview = reviewsResult.recordset.find(
      (review) => review.UserId === req.user.userId
    )

    res.json({
      summary: {
        reviewCount: Number(summaryResult.recordset[0]?.ReviewCount || 0),
        averageRating: Number(summaryResult.recordset[0]?.AverageRating || 0)
      },
      currentUserReview: currentUserReview || null,
      reviews: reviewsResult.recordset.map((review) => ({
        ...review,
        Level: calculateLevel(review.ExperiencePoints, review.BonusLevels).level,
        LeaderboardRank: leaderboardRanks.get(review.UserId) || null,
        ActiveTitle: resolveActiveTitle(
          buildUnlockedTitles({
            role: review.Role,
            level: calculateLevel(review.ExperiencePoints, review.BonusLevels).level,
            leaderboardRank: leaderboardRanks.get(review.UserId) || null
          }),
          review.SelectedTitle
        ),
        AverageLabel: formatAverageRating(summaryResult.recordset[0]?.AverageRating)
      }))
    })
  } catch (err) {
    console.error("GET /books/:id/reviews error:", err)
    res.status(500).json({
      message: "Failed to load reviews",
      error: err.message
    })
  }
})

app.post("/books/:id/reviews", requireAuth, async (req, res) => {
  try {
    const bookId = req.params.id
    const rating = Number(req.body.rating)
    const comment = req.body.comment || null

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" })
    }

    await connectDB()
    await ensureSocialPhase2Schema()

    const existing = await sql.query`
      SELECT TOP 1 ReviewId
      FROM BookReviews
      WHERE UserId = ${req.user.userId}
        AND BookId = ${bookId}
    `

    let reviewId = null

    if (existing.recordset.length > 0) {
      reviewId = existing.recordset[0].ReviewId

      await sql.query`
        UPDATE BookReviews
        SET
          Rating = ${rating},
          Comment = ${comment},
          UpdatedAt = SYSUTCDATETIME()
        WHERE ReviewId = ${reviewId}
      `
    } else {
      const insertResult = await sql.query`
        INSERT INTO BookReviews (UserId, BookId, Rating, Comment)
        OUTPUT INSERTED.ReviewId
        VALUES (${req.user.userId}, ${bookId}, ${rating}, ${comment})
      `

      reviewId = insertResult.recordset[0].ReviewId
      await awardExperiencePoints(req.user.userId, 20)
    }

    await recordActivity(req.user.userId, "reviewed_book", {
      bookId,
      reviewId,
      metadata: { rating }
    })

    res.json({ message: "Review saved successfully", reviewId })
  } catch (err) {
    console.error("POST /books/:id/reviews error:", err)
    res.status(500).json({
      message: "Failed to save review",
      error: err.message
    })
  }
})

app.post("/reviews/:id/helpful", requireAuth, async (req, res) => {
  try {
    const reviewId = Number(req.params.id)

    if (!Number.isInteger(reviewId)) {
      return res.status(400).json({ message: "Invalid review id" })
    }

    await connectDB()

    const reviewResult = await sql.query`
      SELECT ReviewId, UserId
      FROM BookReviews
      WHERE ReviewId = ${reviewId}
    `

    if (reviewResult.recordset.length === 0) {
      return res.status(404).json({ message: "Review not found" })
    }

    const review = reviewResult.recordset[0]

    if (review.UserId === req.user.userId) {
      return res.status(400).json({ message: "You cannot vote on your own review" })
    }

    const existingVote = await sql.query`
      SELECT ReviewId
      FROM ReviewHelpfulVotes
      WHERE ReviewId = ${reviewId}
        AND UserId = ${req.user.userId}
    `

    const isRemoving = existingVote.recordset.length > 0

    if (isRemoving) {
      await sql.query`
        DELETE FROM ReviewHelpfulVotes
        WHERE ReviewId = ${reviewId}
          AND UserId = ${req.user.userId}
      `

      await sql.query`
        UPDATE BookReviews
        SET HelpfulCount = CASE WHEN HelpfulCount > 0 THEN HelpfulCount - 1 ELSE 0 END
        WHERE ReviewId = ${reviewId}
      `
    } else {
      await sql.query`
        INSERT INTO ReviewHelpfulVotes (ReviewId, UserId)
        VALUES (${reviewId}, ${req.user.userId})
      `

      await sql.query`
        UPDATE BookReviews
        SET HelpfulCount = HelpfulCount + 1
        WHERE ReviewId = ${reviewId}
      `
    }

    res.json({
      message: isRemoving ? "Helpful vote removed" : "Marked as helpful",
      helpful: !isRemoving
    })
  } catch (err) {
    console.error("POST /reviews/:id/helpful error:", err)
    res.status(500).json({
      message: "Failed to update helpful vote",
      error: err.message
    })
  }
})

app.post("/users/:id/follow", requireAuth, async (req, res) => {
  try {
    const targetUserId = Number(req.params.id)

    if (!Number.isInteger(targetUserId) || targetUserId === req.user.userId) {
      return res.status(400).json({ message: "Invalid follow target" })
    }

    await connectDB()

    await sql.query`
      IF NOT EXISTS (
        SELECT 1
        FROM UserFollows
        WHERE FollowerUserId = ${req.user.userId}
          AND FollowedUserId = ${targetUserId}
      )
      BEGIN
        INSERT INTO UserFollows (FollowerUserId, FollowedUserId)
        VALUES (${req.user.userId}, ${targetUserId})
      END
    `

    res.json({ message: "Now following user" })
  } catch (err) {
    console.error("POST /users/:id/follow error:", err)
    res.status(500).json({
      message: "Failed to follow user",
      error: err.message
    })
  }
})

app.delete("/users/:id/follow", requireAuth, async (req, res) => {
  try {
    const targetUserId = Number(req.params.id)

    if (!Number.isInteger(targetUserId)) {
      return res.status(400).json({ message: "Invalid follow target" })
    }

    await connectDB()

    await sql.query`
      DELETE FROM UserFollows
      WHERE FollowerUserId = ${req.user.userId}
        AND FollowedUserId = ${targetUserId}
    `

    res.json({ message: "Unfollowed user" })
  } catch (err) {
    console.error("DELETE /users/:id/follow error:", err)
    res.status(500).json({
      message: "Failed to unfollow user",
      error: err.message
    })
  }
})

app.get("/community/feed", requireAuth, async (req, res) => {
  try {
    await connectDB()
    await ensureSocialPhase2Schema()
    await ensureSocialPhase3Schema()
    const leaderboardRanks = await getLeaderboardRanksMap()

    const result = await sql.query`
      SELECT TOP 30
        ua.ActivityId,
        ua.ActivityType,
        ua.BookId,
        ua.ReviewId,
        ua.MetadataJson,
        ua.CreatedAt,
        u.UserId,
        u.Role,
        u.Email,
        up.DisplayName,
        up.AvatarUrl,
        up.AvatarImagePath,
        up.SelectedTitle,
        up.UpdatedAt AS ProfileUpdatedAt,
        ISNULL(up.ExperiencePoints, 0) AS ExperiencePoints,
        ISNULL(up.BonusLevels, 0) AS BonusLevels,
        b.Title AS BookTitle
      FROM UserActivity ua
      INNER JOIN Users u
        ON u.UserId = ua.UserId
      LEFT JOIN UserProfiles up
        ON up.UserId = ua.UserId
      LEFT JOIN Books b
        ON CAST(b.BookId AS NVARCHAR(255)) = ua.BookId
      ORDER BY ua.CreatedAt DESC
    `

    res.json(
      result.recordset
        .filter((item) => ACTIVITY_TYPES_VISIBLE_IN_FEED.includes(item.ActivityType))
        .map((item) => ({
          ...item,
          Level: calculateLevel(item.ExperiencePoints, item.BonusLevels).level,
          LeaderboardRank: leaderboardRanks.get(item.UserId) || null,
          ActiveTitle: resolveActiveTitle(
            buildUnlockedTitles({
              role: item.Role,
              level: calculateLevel(item.ExperiencePoints, item.BonusLevels).level,
              leaderboardRank: leaderboardRanks.get(item.UserId) || null
            }),
            item.SelectedTitle
          ),
          metadata: item.MetadataJson ? JSON.parse(item.MetadataJson) : null
        }))
    )
  } catch (err) {
    console.error("GET /community/feed error:", err)
    res.status(500).json({
      message: "Failed to load community feed",
      error: err.message
    })
  }
})

app.get("/community/leaderboard", requireAuth, async (req, res) => {
  try {
    await connectDB()
    await ensureSocialPhase2Schema()
    await ensureSocialPhase3Schema()

    const usersResult = await sql.query`
      SELECT UserId, Email
      FROM Users
    `

    const leaderboard = await Promise.all(
      usersResult.recordset.map(async (user) => {
        await ensureUserProfile(user.UserId, user.Email)
        await ensureUserGoals(user.UserId)
        const snapshot = await buildUserCommunitySnapshot(user.UserId)

        return {
          userId: user.UserId,
          role: snapshot.profile?.Role || "user",
          displayName: snapshot.profile?.DisplayName || buildDisplayName(user.Email, user.UserId),
          avatarUrl: snapshot.profile?.AvatarUrl || null,
          avatarImagePath: snapshot.profile?.AvatarImagePath || null,
          profileUpdatedAt: snapshot.profile?.ProfileUpdatedAt || null,
          level: snapshot.level?.level || 1,
          experiencePoints: snapshot.profile?.ExperiencePoints || 0,
          activeTitle: snapshot.activeTitle || null,
          completedBooks: snapshot.stats.completedBooks,
          currentStreak: snapshot.stats.currentStreak,
          helpfulVotesReceived: snapshot.stats.helpfulVotesReceived,
          reviewsCount: snapshot.stats.reviewsCount,
          followersCount: snapshot.stats.followersCount
        }
      })
    )

    leaderboard.sort((a, b) => {
      if (b.level !== a.level) {
        return b.level - a.level
      }

      if (b.experiencePoints !== a.experiencePoints) {
        return b.experiencePoints - a.experiencePoints
      }

      if (b.completedBooks !== a.completedBooks) {
        return b.completedBooks - a.completedBooks
      }

      if (b.currentStreak !== a.currentStreak) {
        return b.currentStreak - a.currentStreak
      }

      return b.helpfulVotesReceived - a.helpfulVotesReceived
    })

    res.json(leaderboard.slice(0, 20))
  } catch (err) {
    console.error("GET /community/leaderboard error:", err)
    res.status(500).json({
      message: "Failed to load leaderboard",
      error: err.message
    })
  }
})

app.get("/books/:id/read", requireAuth, async (req, res) => {
  try {
    await connectDB()

    const result = await sql.query`
      SELECT BookId, Title, FileType, BlobPath, ISNULL(IsHidden, 0) AS IsHidden
      FROM Books
      WHERE BookId = ${req.params.id}
    `

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "Book not found" })
    }

    const book = result.recordset[0]

    if (book.IsHidden && req.user.role !== "admin") {
      return res.status(404).json({ message: "Book not found" })
    }

    const blobClient = getContainerClient().getBlobClient(book.BlobPath)
    const downloadResponse = await blobClient.download()

    if (book.FileType === "pdf") {
      res.setHeader("Content-Type", "application/pdf")
      res.setHeader("Content-Disposition", "inline")
      res.setHeader("Access-Control-Expose-Headers", "Content-Type, Content-Disposition")
      downloadResponse.readableStreamBody.pipe(res)
      return
    }

    if (book.FileType === "epub") {
      res.setHeader("Content-Type", "application/epub+zip")
      res.setHeader("Content-Disposition", 'inline; filename="book.epub"')
      res.setHeader("Cache-Control", "no-store")
      res.setHeader("Access-Control-Expose-Headers", "Content-Type, Content-Disposition")
      downloadResponse.readableStreamBody.pipe(res)
      return
    }

    res.status(400).json({ message: "Unsupported file type" })
  } catch (err) {
    console.error("GET /books/:id/read error:", err)
    res.status(500).json({
      message: "Failed to stream book",
      error: err.message
    })
  }
})

app.get("/books/:id/cover", requireAuth, async (req, res) => {
  try {
    await connectDB()

    const result = await sql.query`
      SELECT CoverImagePath, ISNULL(IsHidden, 0) AS IsHidden
      FROM Books
      WHERE BookId = ${req.params.id}
    `

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "Book not found" })
    }

    const book = result.recordset[0]

    if (book.IsHidden && req.user.role !== "admin") {
      return res.status(404).json({ message: "Book not found" })
    }

    if (!book.CoverImagePath) {
      return res.status(404).json({ message: "No custom cover found" })
    }

    const blobClient = getContainerClient().getBlobClient(book.CoverImagePath)
    const downloadResponse = await blobClient.download()

    res.setHeader("Content-Disposition", "inline")
    res.setHeader("Access-Control-Expose-Headers", "Content-Type, Content-Disposition")
    res.setHeader("Content-Type", downloadResponse.contentType || "image/jpeg")
    res.setHeader("Cache-Control", "no-store")

    downloadResponse.readableStreamBody.pipe(res)
  } catch (err) {
    console.error("GET /books/:id/cover error:", err)
    res.status(500).json({
      message: "Failed to stream cover image",
      error: err.message
    })
  }
})

app.listen(PORT, async () => {
  try {
    await connectDB()
    console.log(`Server running on port ${PORT}`)
  } catch (err) {
    console.error("Server startup failed:", err)
  }
})
