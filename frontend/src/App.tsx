import { useEffect, useState } from "react";

type ApiMessage = {
  message: string;
};

export default function App() {
  const [message, setMessage] = useState("Connecting to the API…");
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    fetch("/api/message")
      .then((response) => {
        if (!response.ok) throw new Error("API request failed");
        return response.json() as Promise<ApiMessage>;
      })
      .then((data) => {
        setMessage(data.message);
        setConnected(true);
      })
      .catch(() => setMessage("The API is currently unavailable"));
  }, []);

  return (
    <main>
      <section className="card">
        <p className="eyebrow">BSK MEDIA NEST</p>
        <h1>Python + React, ready to build.</h1>
        <p className="message">{message}</p>
        <div className={`status ${connected ? "online" : ""}`}>
          <span aria-hidden="true" />
          {connected ? "Backend connected" : "Waiting for backend"}
        </div>
      </section>
    </main>
  );
}
