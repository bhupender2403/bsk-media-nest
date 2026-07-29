import { useCallback, useEffect, useState } from "react";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

const isDesktop = window.__TAURI_INTERNALS__ !== undefined;
const apiBaseUrl =
  import.meta.env.VITE_API_URL || (isDesktop ? "http://127.0.0.1:8765" : "");
const apiUrl = (path: string) => `${apiBaseUrl}${path}`;

type ImageFolder = {
  id: number;
  name: string;
  image_count: number;
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
  content_url: string;
};

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
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    void loadFolders();
    void loadJobs();
    const refreshTimer = window.setInterval(() => {
      void loadFolders();
      void loadJobs();
    }, 2000);
    return () => window.clearInterval(refreshTimer);
  }, [loadFolders, loadJobs]);

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
  }, [selectedFolderId, jobs]);

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
      await loadJobs();
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
                    {folder.image_count} {folder.image_count === 1 ? "file" : "files"}
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
              {mediaFiles.length} {mediaFiles.length === 1 ? "item" : "items"}
            </span>
          )}
        </header>

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
        ) : (
          <div className="media-grid">
            {mediaFiles.map((file) => (
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
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
