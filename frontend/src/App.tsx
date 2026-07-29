import { useCallback, useEffect, useMemo, useState } from "react";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

const isDesktop = window.__TAURI_INTERNALS__ !== undefined;
const apiBaseUrl =
  import.meta.env.VITE_API_URL || (isDesktop ? "http://127.0.0.1:8765" : "");
const apiUrl = (path: string) => `${apiBaseUrl}${path}`;
const isJobActive = (job: ImportJob) =>
  job.status === "pending" || job.status === "processing";

type ImageFolder = {
  id: number;
  name: string;
  image_count: number;
  movie_count: number;
  pending_rating_count: number;
  created_at: string;
};

type ImportJob = {
  id: string;
  folder_id: number;
  folder_name: string;
  status: string;
  total_files: number;
  processed_files: number;
  imported_files: number;
  failed_files: number;
  error: string | null;
  created_at: string;
};

type MediaFile = {
  id: number;
  relative_path: string;
  media_type: string;
  media_kind: "image" | "video" | "audio" | "other";
  size: number;
  md5: string;
  rating: number | null;
  content_url: string;
};

type MediaKindFilter = "all" | "image" | "video";
type RatingFilter = "all" | "unrated" | "1" | "2" | "3" | "4" | "5";
type SidebarView = "folders" | "jobs";
type DisplayMode = "small" | "large" | "slideshow";

export default function App() {
  const [folders, setFolders] = useState<ImageFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [connected, setConnected] = useState(false);
  const [notice, setNotice] = useState("Choose a media folder to import.");
  const [saving, setSaving] = useState(false);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [savingRatingMd5, setSavingRatingMd5] = useState<string | null>(null);
  const [mediaRevision, setMediaRevision] = useState(0);
  const [mediaKindFilter, setMediaKindFilter] =
    useState<MediaKindFilter>("all");
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("all");
  const [sidebarView, setSidebarView] = useState<SidebarView>("folders");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("large");
  const [selectedSlideId, setSelectedSlideId] = useState<number | null>(null);

  const loadFolders = useCallback(async () => {
    try {
      const response = await fetch(apiUrl("/api/folders"));
      if (!response.ok) throw new Error("API request failed");
      const nextFolders = (await response.json()) as ImageFolder[];
      setFolders(nextFolders);
      setSelectedFolderId((current) => {
        if (current && nextFolders.some((folder) => folder.id === current)) {
          return current;
        }
        return nextFolders[0]?.id ?? null;
      });
      setConnected(true);
    } catch {
      setConnected(false);
      setNotice("The API or database is currently unavailable.");
    }
  }, []);

  const loadJobs = useCallback(async () => {
    try {
      const response = await fetch(apiUrl("/api/import-jobs"));
      if (!response.ok) throw new Error("API request failed");
      const nextJobs = (await response.json()) as ImportJob[];
      setJobs(nextJobs);
      return nextJobs;
    } catch {
      setConnected(false);
      return null;
    }
  }, []);

  useEffect(() => {
    void loadFolders();
    void loadJobs();
  }, [loadFolders, loadJobs]);

  const hasActiveJobs = jobs.some(isJobActive);

  useEffect(() => {
    if (!hasActiveJobs) return;

    const refreshTimer = window.setInterval(() => {
      void (async () => {
        const nextJobs = await loadJobs();
        if (nextJobs && !nextJobs.some(isJobActive)) {
          await loadFolders();
          setMediaRevision((current) => current + 1);
        }
      })();
    }, 2000);
    return () => window.clearInterval(refreshTimer);
  }, [hasActiveJobs, loadFolders, loadJobs]);

  useEffect(() => {
    if (selectedFolderId === null) {
      setMediaFiles([]);
      return;
    }
    const loadMedia = async () => {
      setLoadingMedia(true);
      try {
        const response = await fetch(
          apiUrl(`/api/folders/${selectedFolderId}/files`),
        );
        if (!response.ok) throw new Error("Unable to load media");
        setMediaFiles((await response.json()) as MediaFile[]);
      } catch {
        setNotice("Could not load media for this folder.");
      } finally {
        setLoadingMedia(false);
      }
    };
    void loadMedia();
  }, [selectedFolderId, mediaRevision]);

  const importFolder = async (path: string) => {
    if (!path.trim()) return;
    setSaving(true);
    setNotice("Scanning local media files…");

    try {
      const response = await fetch(apiUrl("/api/import-jobs"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_path: path.trim() }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { detail?: string };
        throw new Error(body.detail || "Unable to scan folder");
      }
      const job = (await response.json()) as ImportJob;
      setNotice(`Indexing “${job.folder_name}” without copying files.`);
      setSelectedFolderId(job.folder_id);
      await loadFolders();
      const nextJobs = await loadJobs();
      if (nextJobs && !nextJobs.some(isJobActive)) {
        await loadFolders();
        setMediaRevision((current) => current + 1);
      }
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not scan the folder.",
      );
    } finally {
      setSaving(false);
    }
  };

  const selectFolder = async () => {
    try {
      let selected: string | null = null;
      if (isDesktop) {
        const { open } = await import("@tauri-apps/plugin-dialog");
        selected = await open({
          directory: true,
          multiple: false,
          title: "Choose a media folder",
        });
      } else {
        const response = await fetch(apiUrl("/api/system/select-folder"), {
          method: "POST",
        });
        if (!response.ok) {
          const body = (await response.json()) as { detail?: string };
          throw new Error(body.detail || "Unable to open the folder picker");
        }
        const body = (await response.json()) as { path: string | null };
        selected = body.path;
      }
      if (typeof selected === "string") {
        await importFolder(selected);
      }
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "The native folder picker is unavailable.",
      );
    }
  };

  const removeFolder = async (folder: ImageFolder) => {
    const confirmed = window.confirm(
      `Remove “${folder.name}” from the catalog? Original media files will not be deleted.`,
    );
    if (!confirmed) return;

    try {
      const response = await fetch(apiUrl(`/api/folders/${folder.id}`), {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = (await response.json()) as { detail?: string };
        throw new Error(body.detail || "Unable to remove folder");
      }
      if (selectedFolderId === folder.id) {
        setSelectedFolderId(null);
        setMediaFiles([]);
      }
      setNotice(`Removed “${folder.name}” from the catalog.`);
      await loadFolders();
      await loadJobs();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not remove the folder.",
      );
    }
  };

  const selectedFolder = folders.find(
    (folder) => folder.id === selectedFolderId,
  );

  const filteredMediaFiles = useMemo(
    () =>
      mediaFiles.filter((file) => {
        const matchesKind =
          mediaKindFilter === "all" || file.media_kind === mediaKindFilter;
        const matchesRating =
          ratingFilter === "all" ||
          (ratingFilter === "unrated"
            ? file.rating === null
            : file.rating === Number(ratingFilter));
        return matchesKind && matchesRating;
      }),
    [mediaFiles, mediaKindFilter, ratingFilter],
  );
  const hasActiveFilters =
    mediaKindFilter !== "all" || ratingFilter !== "all";
  const slideshowFiles = useMemo(
    () => filteredMediaFiles.filter((file) => file.media_kind === "image"),
    [filteredMediaFiles],
  );
  const selectedSlide =
    slideshowFiles.find((file) => file.id === selectedSlideId) ??
    slideshowFiles[0] ??
    null;

  useEffect(() => {
    if (displayMode !== "slideshow") return;
    setSelectedSlideId((current) =>
      current !== null && slideshowFiles.some((file) => file.id === current)
        ? current
        : (slideshowFiles[0]?.id ?? null),
    );
  }, [displayMode, slideshowFiles]);

  const changeDisplayMode = (mode: DisplayMode) => {
    setDisplayMode(mode);
    if (mode === "slideshow") {
      setMediaKindFilter("image");
    }
  };

  const moveSlide = (direction: -1 | 1) => {
    if (selectedSlide === null || slideshowFiles.length < 2) return;
    const currentIndex = slideshowFiles.findIndex(
      (file) => file.id === selectedSlide.id,
    );
    const nextIndex =
      (currentIndex + direction + slideshowFiles.length) % slideshowFiles.length;
    setSelectedSlideId(slideshowFiles[nextIndex].id);
  };

  const rateMedia = async (file: MediaFile, rating: number) => {
    setSavingRatingMd5(file.md5);
    try {
      const response = await fetch(apiUrl(`/api/files/${file.id}/rating`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating }),
      });
      if (!response.ok) throw new Error("Unable to save rating");
      const saved = (await response.json()) as { md5: string; rating: number };
      setMediaFiles((current) =>
        current.map((item) =>
          item.md5 === saved.md5 ? { ...item, rating: saved.rating } : item,
        ),
      );
      await loadFolders();
    } catch {
      setNotice("Could not save the media rating.");
    } finally {
      setSavingRatingMd5(null);
    }
  };

  const fileName = (path: string) => path.split("/").at(-1) ?? path;
  const fileSize = (size: number) => {
    if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <nav className="sidebar-rail" aria-label="Library sections">
          <button
            type="button"
            className={sidebarView === "folders" ? "active" : ""}
            aria-label="Show folder list"
            aria-pressed={sidebarView === "folders"}
            title="Folders"
            onClick={() => setSidebarView("folders")}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-10Z" />
            </svg>
          </button>
          <button
            type="button"
            className={sidebarView === "jobs" ? "active" : ""}
            aria-label="Show import job list"
            aria-pressed={sidebarView === "jobs"}
            title="Import jobs"
            onClick={() => setSidebarView("jobs")}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 3h10v3h3v15H4V6h3V3Zm2 3h6V5H9v1Zm-2 4v2h10v-2H7Zm0 5v2h7v-2H7Z" />
            </svg>
            {jobs.some(isJobActive) && <span className="rail-indicator" />}
          </button>
        </nav>

        <div className="sidebar-panel">
        <header className="brand">
          <p className="eyebrow">BSK MEDIA NEST</p>
          <h1>{sidebarView === "folders" ? "Library" : "Imports"}</h1>
          <p className="message">{notice}</p>
        </header>

        {sidebarView === "folders" && (
          <>
        <div className="import-action">
          <button
            className="picker"
            type="button"
            disabled={saving}
            onClick={selectFolder}
          >
            {saving ? "Scanning…" : "Choose folder"}
          </button>
        </div>

        <nav className="catalog" aria-label="Media folders">
          <h2>Folders</h2>
          {folders.length === 0 ? (
            <p className="empty">No media folders yet.</p>
          ) : (
            folders.map((folder) => (
              <div className="folder-row" key={folder.id}>
                <button
                  className={`folder ${folder.id === selectedFolderId ? "selected" : ""}`}
                  onClick={() => setSelectedFolderId(folder.id)}
                  type="button"
                >
                  <div className="folder-icon" aria-hidden="true">◆</div>
                  <div>
                    <h2>{folder.name}</h2>
                    <p>
                      {folder.image_count}{" "}
                      {folder.image_count === 1 ? "image" : "images"}
                      {" · "}
                      {folder.movie_count}{" "}
                      {folder.movie_count === 1 ? "movie" : "movies"}
                    </p>
                    <p className="pending-rating">
                      {folder.pending_rating_count === 0
                        ? "All media rated"
                        : `${folder.pending_rating_count} awaiting rating`}
                    </p>
                  </div>
                </button>
                <button
                  className="remove-folder"
                  type="button"
                  aria-label={`Remove ${folder.name} from catalog`}
                  title="Remove from catalog"
                  onClick={() => void removeFolder(folder)}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </nav>
          </>
        )}

        {sidebarView === "jobs" && (
          <section className="jobs" aria-label="Import jobs">
            <h2>Recent imports</h2>
            {jobs.length === 0 ? (
              <p className="empty">No import jobs yet.</p>
            ) : jobs.slice(0, 20).map((job) => {
              const progress =
                job.total_files === 0
                  ? 0
                  : Math.round((job.processed_files / job.total_files) * 100);
              return (
                <article className="job" key={job.id}>
                  <div className="job-summary">
                    <strong>{job.folder_name}</strong>
                    <span>{job.status.replaceAll("_", " ")}</span>
                  </div>
                  <div className="progress" aria-label={`${progress}% complete`}>
                    <span style={{ width: `${progress}%` }} />
                  </div>
                  <small>
                    {job.processed_files}/{job.total_files} processed
                    {job.failed_files > 0 && ` · ${job.failed_files} failed`}
                  </small>
                </article>
              );
            })}
          </section>
        )}

        <div className={`status ${connected ? "online" : ""}`}>
          <span aria-hidden="true" />
          {connected ? "Database connected" : "Waiting for database"}
        </div>
        </div>
      </aside>

      <section className="media-browser">
        {selectedFolder && mediaFiles.length > 0 && (
          <div className="media-filters" aria-label="Media filters">
            <div className="filter-folder">
              <strong>{selectedFolder.name}</strong>
              <span className="file-count">
              {filteredMediaFiles.length}
              {hasActiveFilters && ` of ${mediaFiles.length}`}{" "}
              {filteredMediaFiles.length === 1 ? "item" : "items"}
              </span>
            </div>
            <div className="kind-filter" role="group" aria-label="Media type">
              {(
                [
                  ["all", "All"],
                  ["image", "Images"],
                  ["video", "Movies"],
                ] as const
              ).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={mediaKindFilter === value ? "active" : ""}
                  aria-pressed={mediaKindFilter === value}
                  onClick={() => setMediaKindFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="rating-filter">
              <span>Rating</span>
              <select
                value={ratingFilter}
                onChange={(event) =>
                  setRatingFilter(event.target.value as RatingFilter)
                }
              >
                <option value="all">Any rating</option>
                <option value="5">5 stars</option>
                <option value="4">4 stars</option>
                <option value="3">3 stars</option>
                <option value="2">2 stars</option>
                <option value="1">1 star</option>
                <option value="unrated">Unrated</option>
              </select>
            </label>
            {hasActiveFilters && (
              <button
                className="clear-filters"
                type="button"
                onClick={() => {
                  setMediaKindFilter("all");
                  setRatingFilter("all");
                }}
              >
                Clear filters
              </button>
            )}
            <div
              className="display-modes"
              role="group"
              aria-label="Media display"
            >
              <button
                type="button"
                className={displayMode === "small" ? "active" : ""}
                aria-label="Small icons"
                aria-pressed={displayMode === "small"}
                title="Small icons"
                onClick={() => changeDisplayMode("small")}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 3h5v5H3V3Zm6.5 0h5v5h-5V3ZM16 3h5v5h-5V3ZM3 9.5h5v5H3v-5Zm6.5 0h5v5h-5v-5Zm6.5 0h5v5h-5v-5ZM3 16h5v5H3v-5Zm6.5 0h5v5h-5v-5Zm6.5 0h5v5h-5v-5Z" />
                </svg>
              </button>
              <button
                type="button"
                className={displayMode === "large" ? "active" : ""}
                aria-label="Large icons"
                aria-pressed={displayMode === "large"}
                title="Large icons"
                onClick={() => changeDisplayMode("large")}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 3h8v8H3V3Zm10 0h8v8h-8V3ZM3 13h8v8H3v-8Zm10 0h8v8h-8v-8Z" />
                </svg>
              </button>
              <button
                type="button"
                className={displayMode === "slideshow" ? "active" : ""}
                aria-label="Slideshow"
                aria-pressed={displayMode === "slideshow"}
                title="Slideshow"
                onClick={() => changeDisplayMode("slideshow")}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 4h16v13H4V4Zm2 2v9h12V6H6Zm3 13h6v2H9v-2Zm1-11 5 2.5-5 2.5V8Z" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {loadingMedia ? (
          <div className="gallery-empty">Loading media…</div>
        ) : mediaFiles.length === 0 ? (
          <div className="gallery-empty">
            <div className="empty-icon" aria-hidden="true">◇</div>
            <h3>{selectedFolder ? "This folder is empty" : "No folder selected"}</h3>
            <p>
              {selectedFolder
                ? "Imported images and videos will appear here."
                : "Choose a folder from the left pane."}
            </p>
          </div>
        ) : filteredMediaFiles.length === 0 ? (
          <div className="gallery-empty">
            <div className="empty-icon" aria-hidden="true">◇</div>
            <h3>No matching media</h3>
            <p>Try another media type or star rating.</p>
            <button
              className="empty-clear"
              type="button"
              onClick={() => {
                setMediaKindFilter("all");
                setRatingFilter("all");
              }}
            >
              Clear filters
            </button>
          </div>
        ) : displayMode === "slideshow" ? (
          slideshowFiles.length === 0 || selectedSlide === null ? (
            <div className="gallery-empty">
              <div className="empty-icon" aria-hidden="true">◇</div>
              <h3>No images for slideshow</h3>
              <p>Change the filters or choose a folder containing images.</p>
            </div>
          ) : (
            <section className="slideshow" aria-label="Image slideshow">
              <div className="slide-viewer">
                <div className="slide-stage">
                  <button
                    className="slide-navigation previous"
                    type="button"
                    aria-label="Previous image"
                    disabled={slideshowFiles.length < 2}
                    onClick={() => moveSlide(-1)}
                  >
                    ‹
                  </button>
                  <img
                    src={apiUrl(selectedSlide.content_url)}
                    alt={fileName(selectedSlide.relative_path)}
                  />
                  <button
                    className="slide-navigation next"
                    type="button"
                    aria-label="Next image"
                    disabled={slideshowFiles.length < 2}
                    onClick={() => moveSlide(1)}
                  >
                    ›
                  </button>
                </div>
                <aside className="slide-info" aria-label="Image information">
                  <p className="section-label">IMAGE INFO</p>
                  <h3>{fileName(selectedSlide.relative_path)}</h3>
                  <dl>
                    <div>
                      <dt>Path</dt>
                      <dd title={selectedSlide.relative_path}>
                        {selectedSlide.relative_path}
                      </dd>
                    </div>
                    <div>
                      <dt>Format</dt>
                      <dd>{selectedSlide.media_type}</dd>
                    </div>
                    <div>
                      <dt>Size</dt>
                      <dd>{fileSize(selectedSlide.size)}</dd>
                    </div>
                    <div>
                      <dt>MD5</dt>
                      <dd title={selectedSlide.md5}>{selectedSlide.md5}</dd>
                    </div>
                    <div>
                      <dt>Rating</dt>
                      <dd className="info-rating">
                        <span className="info-rating-stars" aria-hidden="true">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <span
                              className={
                                star <= (selectedSlide.rating ?? 0)
                                  ? "filled"
                                  : ""
                              }
                              key={star}
                            >
                              {star <= (selectedSlide.rating ?? 0) ? "★" : "☆"}
                            </span>
                          ))}
                        </span>
                        <span>
                          {selectedSlide.rating === null
                            ? "Not rated"
                            : `${selectedSlide.rating} of 5 stars`}
                        </span>
                      </dd>
                    </div>
                  </dl>
                </aside>
              </div>
              <div className="slide-controls">
                <div
                  className="rating slide-rating"
                  aria-label={
                    selectedSlide.rating === null
                      ? "Not rated"
                      : `${selectedSlide.rating} out of 5 stars`
                  }
                >
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      className={
                        star <= (selectedSlide.rating ?? 0) ? "filled" : ""
                      }
                      type="button"
                      key={star}
                      aria-label={`Rate ${fileName(selectedSlide.relative_path)} ${star} star${star === 1 ? "" : "s"}`}
                      aria-pressed={star === selectedSlide.rating}
                      disabled={savingRatingMd5 === selectedSlide.md5}
                      onClick={() => void rateMedia(selectedSlide, star)}
                    >
                      {star <= (selectedSlide.rating ?? 0) ? "★" : "☆"}
                    </button>
                  ))}
                </div>
                <span>
                  {slideshowFiles.findIndex(
                    (file) => file.id === selectedSlide.id,
                  ) + 1}
                  {" / "}
                  {slideshowFiles.length}
                </span>
              </div>
              <div className="slide-thumbnails" aria-label="Slideshow images">
                {slideshowFiles.map((file) => (
                  <button
                    type="button"
                    key={file.id}
                    className={file.id === selectedSlide.id ? "active" : ""}
                    aria-label={`Show ${fileName(file.relative_path)}, ${
                      file.rating === null
                        ? "not rated"
                        : `rated ${file.rating} stars`
                    }`}
                    aria-pressed={file.id === selectedSlide.id}
                    onClick={() => setSelectedSlideId(file.id)}
                  >
                    <img
                      src={apiUrl(file.content_url)}
                      alt=""
                      loading="lazy"
                    />
                    <span className="thumbnail-rating" aria-hidden="true">
                      {file.rating === null ? "☆" : `★ ${file.rating}`}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )
        ) : (
          <div className={`media-grid ${displayMode}`}>
            {filteredMediaFiles.map((file) => (
              <article className="media-card" key={file.id}>
                <div className="preview">
                  {file.media_kind === "image" && (
                    <img
                      src={apiUrl(file.content_url)}
                      alt={fileName(file.relative_path)}
                      loading="lazy"
                    />
                  )}
                  {file.media_kind === "video" && (
                    <video src={apiUrl(file.content_url)} controls preload="metadata" />
                  )}
                  {file.media_kind === "audio" && (
                    <div className="audio-preview">
                      <span aria-hidden="true">♪</span>
                      <audio
                        src={apiUrl(file.content_url)}
                        controls
                        preload="metadata"
                      />
                    </div>
                  )}
                  {file.media_kind === "other" && (
                    <div className="other-preview" aria-hidden="true">FILE</div>
                  )}
                </div>
                <div className="media-meta">
                  <strong title={file.relative_path}>
                    {fileName(file.relative_path)}
                  </strong>
                  <span>{file.media_kind} · {fileSize(file.size)}</span>
                  {["image", "video"].includes(file.media_kind) && (
                    <div
                      className="rating"
                      aria-label={
                        file.rating === null
                          ? "Not rated"
                          : `${file.rating} out of 5 stars`
                      }
                    >
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          className={star <= (file.rating ?? 0) ? "filled" : ""}
                          type="button"
                          key={star}
                          aria-label={`Rate ${fileName(file.relative_path)} ${star} star${star === 1 ? "" : "s"}`}
                          aria-pressed={star === file.rating}
                          disabled={savingRatingMd5 === file.md5}
                          onClick={() => void rateMedia(file, star)}
                        >
                          {star <= (file.rating ?? 0) ? "★" : "☆"}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
