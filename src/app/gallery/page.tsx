"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type MediaItem = {
  fileKey: string;
  fileType: string;
  uploadDate: string;
  uploadedBy: string;
  url: string;
};

export default function GalleryPage() {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const router = useRouter();

  useEffect(() => {
    console.log("Gallery page useEffect triggered");
    const token = localStorage.getItem("token");

    if (!token) {
      console.log("No token found, redirecting to login");
      try {
        router.push("/");
      } catch (err) {
        console.error("Router push error:", err);
      }
      return;
    }

    const fetchMedia = async () => {
      console.log("Fetching media from /api/media");
      try {
        const response = await fetch("/api/media", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        console.log("Fetch response status:", response.status);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to fetch media");
        }
        const data = await response.json();

        setMedia(data);
      } catch (err) {
        console.error("Fetch error:", err);
        setError((err as Error).message || "An error occurred");
      } finally {
        setLoading(false);
      }
    };

    setTimeout(() => {
      fetchMedia();
    }, 100);
  }, [router]);

  const openModal = (item: MediaItem) => {
    setSelectedMedia(item);
  };

  const closeModal = () => {
    console.log("Closing modal, setting selectedMedia to null");
    setSelectedMedia(null);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (error) {
    return <div className="min-h-screen flex items-center justify-center text-red-500">{error}</div>;
  }

  return (
    <div className="min-h-screen p-8 bg-gray-100">
      <h1 className="text-3xl font-bold text-center mb-8">My Media Gallery</h1>
      <button
        onClick={() => {
          try {
            router.push("/dashboard");
          } catch (err) {
            console.error("Router push error on back button:", err);
          }
        }}
        className="mb-4 bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
      >
        Back to Dashboard
      </button>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        {media.length === 0 ? (
          <p className="text-center col-span-full">
            No media found. Upload some images or videos from the dashboard!
          </p>
        ) : (
          media.map((item) => (
            <div
              key={item.fileKey}
              className="bg-white p-4 rounded shadow-md cursor-pointer"
              onClick={() => openModal(item)}
            >
              {item.fileType === "image" ? (
                <img
                  src={item.url}
                  alt={item.fileKey}
                  className="w-full h-48 object-cover rounded"
                />
              ) : (
                <video
                  src={item.url}
                  className="w-full h-48 object-cover rounded"
                  muted
                />
              )}
              <p className="mt-2 text-sm text-gray-600">
                {item.fileKey} <br />
                Uploaded: {new Date(item.uploadDate).toLocaleString()}
              </p>
            </div>
          ))
        )}
      </div>

      {/* Modal for viewing full media */}
      {selectedMedia && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              console.log("Clicked outside modal, closing");
              closeModal();
            }
          }}
        >
          <div className="relative bg-white p-4 rounded max-w-3xl w-full">
            <button
              onClick={() => {
                console.log("Close button clicked");
                closeModal();
              }}
              className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded hover:bg-red-600 z-50"
            >
              Close
            </button>
            {selectedMedia.fileType === "image" ? (
              <img
                src={selectedMedia.url}
                alt={selectedMedia.fileKey}
                className="w-full h-auto max-h-[80vh] object-contain"
              />
            ) : (
              <video
                src={selectedMedia.url}
                controls
                className="w-full h-auto max-h-[80vh] object-contain z-0"
              />
            )}
            <p className="mt-2 text-sm text-gray-600 text-center">
              {selectedMedia.fileKey} <br />
              Uploaded: {new Date(selectedMedia.uploadDate).toLocaleString()}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}