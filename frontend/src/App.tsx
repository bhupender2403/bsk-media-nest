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

export default function App() {
  const [folders, setFolders] = useState<ImageFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [connected, setConnected] = useState(false);
  const [notice, setNotice] = useState("Choose a media folder to import.");
  const [saving, setSaving] = useState(false);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [folderPath, setFolderPath] = useState("");
  const [savingRatingMd5, setSavingRatingMd5] = useState<string | null>(null);
  const [mediaRevision, setMediaRevision] = useState(0);
  const [mediaKindFilter, setMediaKindFilter] =
    useState<MediaKindFilter>("all");
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("all");

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

  const scanFolder = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void importFolder(folderPath);
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
        setFolderPath(selected);
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
        <header className="brand">
          <p className="eyebrow">BSK MEDIA NEST</p>
          <h1>Library</h1>
          <p className="message">{notice}</p>
        </header>

        <form className="import-action" onSubmit={scanFolder}>
          <label htmlFor="folder-path">
            {isDesktop ? "Selected media folder" : "Local folder path"}
          </label>
          <input
            id="folder-path"
            type="text"
            value={folderPath}
            onChange={(event) => setFolderPath(event.target.value)}
            placeholder={isDesktop ? "Choose a folder below" : "/Users/name/Pictures"}
            disabled={saving}
            readOnly={isDesktop}
          />
          <button
            className="picker"
            type="button"
            disabled={saving}
            onClick={selectFolder}
          >
            {saving ? "Scanning…" : "Choose folder"}
          </button>
          {!isDesktop && (
            <button className="path-import" type="submit" disabled={saving}>
              Import typed path
            </button>
          )}
        </form>

        <nav className="catalog" aria-label="Media folders">
          <h2>Folders</h2>
          {folders.length === 0 ? (
            <p className="empty">No media folders yet.</p>
          ) : (
            folders.map((folder) => (
              <button
                className={`folder ${folder.id === selectedFolderId ? "selected" : ""}`}
                key={folder.id}
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
                      ? "All images rated"
                      : `${folder.pending_rating_count} awaiting rating`}
                  </p>
                </div>
              </button>
            ))
          )}
        </nav>

        {jobs.length > 0 && (
          <section className="jobs" aria-label="Import jobs">
            <h2>Recent imports</h2>
            {jobs.slice(0, 5).map((job) => {
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
      </aside>

      <section className="media-browser">
        <header className="browser-header">
          <div>
            <p className="section-label">CURRENT FOLDER</p>
            <h2>{selectedFolder?.name ?? "Select a folder"}</h2>
          </div>
          {selectedFolder && (
            <span className="file-count">
              {filteredMediaFiles.length}
              {hasActiveFilters && ` of ${mediaFiles.length}`}{" "}
              {filteredMediaFiles.length === 1 ? "item" : "items"}
            </span>
          )}
        </header>

        {selectedFolder && mediaFiles.length > 0 && (
          <div className="media-filters" aria-label="Media filters">
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
        ) : (
          <div className="media-grid">
            {filteredMediaFiles.map((file) => (
              <article className="media-card" key={file.id}>
                <div className="preview">
                  {["image", "video"].includes(file.media_kind) && (
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
                  {file.media_kind === "image" && (
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
