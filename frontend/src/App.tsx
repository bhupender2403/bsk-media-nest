import { useEffect, useState } from "react";

type ImageFolder = {
  id: number;
  name: string;
  image_count: number;
  created_at: string;
};

export default function App() {
  const [folders, setFolders] = useState<ImageFolder[]>([]);
  const [connected, setConnected] = useState(false);
  const [notice, setNotice] = useState("Choose a folder containing images.");
  const [saving, setSaving] = useState(false);

  const loadFolders = async () => {
    try {
      const response = await fetch("/api/folders");
      if (!response.ok) throw new Error("API request failed");
      setFolders((await response.json()) as ImageFolder[]);
      setConnected(true);
    } catch {
      setConnected(false);
      setNotice("The API or database is currently unavailable.");
    }
  };

  useEffect(() => {
    void loadFolders();
  }, []);

  const selectFolder = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    const imageFiles = selectedFiles.filter((file) =>
      file.type.startsWith("image/"),
    );

    if (imageFiles.length === 0) {
      setNotice("That folder does not contain supported image files.");
      event.target.value = "";
      return;
    }

    const firstPath = imageFiles[0].webkitRelativePath;
    const folderName = firstPath.split("/")[0] || "Selected folder";
    setSaving(true);
    setNotice(`Saving ${imageFiles.length} image records…`);

    try {
      const response = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: folderName,
          images: imageFiles.map((file) => ({
            relative_path: file.webkitRelativePath || file.name,
            media_type: file.type,
            size: file.size,
            last_modified: new Date(file.lastModified).toISOString(),
          })),
        }),
      });
      if (!response.ok) throw new Error("Unable to save folder");
      const result = (await response.json()) as {
        created: boolean;
        folder: ImageFolder;
      };
      setNotice(
        result.created
          ? `Saved “${result.folder.name}” with ${result.folder.image_count} images.`
          : `“${result.folder.name}” is already in the catalog.`,
      );
      await loadFolders();
    } catch {
      setNotice("Could not save the folder. Please try again.");
    } finally {
      setSaving(false);
      event.target.value = "";
    }
  };

  return (
    <main>
      <section className="card">
        <p className="eyebrow">BSK MEDIA NEST</p>
        <div className="heading-row">
          <div>
            <h1>Image folders</h1>
            <p className="message">{notice}</p>
          </div>
          <label className={`picker ${saving ? "disabled" : ""}`}>
            {saving ? "Saving…" : "Select folder"}
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={saving}
              onChange={selectFolder}
              {...({ webkitdirectory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
            />
          </label>
        </div>

        <div className="catalog">
          {folders.length === 0 ? (
            <p className="empty">No image folders have been added yet.</p>
          ) : (
            folders.map((folder) => (
              <article className="folder" key={folder.id}>
                <div className="folder-icon" aria-hidden="true">▰</div>
                <div>
                  <h2>{folder.name}</h2>
                  <p>
                    {folder.image_count} {folder.image_count === 1 ? "image" : "images"}
                  </p>
                </div>
                <time dateTime={folder.created_at}>
                  {new Date(folder.created_at).toLocaleDateString()}
                </time>
              </article>
            ))
          )}
        </div>

        <div className={`status ${connected ? "online" : ""}`}>
          <span aria-hidden="true" />
          {connected ? "Database connected" : "Waiting for database"}
        </div>
      </section>
    </main>
  );
}
