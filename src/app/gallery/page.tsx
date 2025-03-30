"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image"; // Import the Image component
import { useRouter } from "next/navigation";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

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
  const modalRef = useRef<HTMLDivElement>(null); // For focus trapping in the modal

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
          const contentType = response.headers.get("content-type");
          let errorData;
          if (contentType && contentType.includes("application/json")) {
            errorData = await response.json();
            throw new Error(errorData.error || "Failed to fetch media");
          } else {
            const text = await response.text();
            console.error("Non-JSON response from /api/media:", text);
            throw new Error(`Failed to fetch media: Server returned status ${response.status} with response: ${text}`);
          }
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

  const handleDelete = async () => {
    if (!selectedMedia) return;
    try {
      const token = localStorage.getItem("token");
      // Assumes your API handles deletion with a DELETE request using fileKey as a query parameter
      const response = await fetch(`/api/media?fileKey=${selectedMedia.fileKey}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete media");
      }
      // Remove deleted item from media
      setMedia(media.filter((item) => item.fileKey !== selectedMedia.fileKey));
      toast.success("Media deleted successfully");
      closeModal();
    } catch (error) {
      toast.error((error as Error).message || "Delete failed");
    }
  };

  // Focus trapping for accessibility in the modal
  useEffect(() => {
    if (selectedMedia && modalRef.current) {
      const focusableElements = modalRef.current.querySelectorAll(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
      );
      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          closeModal();
        }
        if (e.key === "Tab") {
          if (e.shiftKey) {
            if (document.activeElement === firstElement) {
              e.preventDefault();
              lastElement.focus();
            }
          } else {
            if (document.activeElement === lastElement) {
              e.preventDefault();
              firstElement.focus();
            }
          }
        }
      };

      firstElement?.focus();
      document.addEventListener("keydown", handleKeyDown);

      return () => {
        document.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [selectedMedia]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return <div className="min-h-screen flex items-center justify-center text-red-500">{error}</div>;
  }

  return (
    <div className="min-h-screen p-8 bg-gray-100">
      <ToastContainer />
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
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
        {media.length === 0 ? (
          <p className="text-center col-span-full">
            No media found. Upload some images or videos from the dashboard!
          </p>
        ) : (
          media.map((item) => (
            <div
              key={item.fileKey}
              className="bg-white p-1 rounded shadow-md cursor-pointer"
              onClick={() => openModal(item)}
            >
              {item.fileType === "image" ? (
                <div className="relative w-full aspect-square">
                  <Image
                    src={item.url}
                    alt={item.fileKey}
                    fill
                    className="object-cover rounded"
                  />
                </div>
              ) : (
                <div className="relative w-full aspect-square">
                  <video
                    src={item.url}
                    className="object-cover rounded h-full w-full"
                    muted
                  />
                </div>
              )}
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
          <div ref={modalRef} className="relative bg-white p-4 rounded max-w-3xl w-full">
            <div className="absolute top-2 right-2 flex space-x-2 z-50">
              <button
                onClick={handleDelete}
                className="bg-red-500 text-white p-2 rounded hover:bg-red-600"
              >
                Delete
              </button>
              <button
                onClick={() => {
                  console.log("Close button clicked");
                  closeModal();
                }}
                className="bg-gray-500 text-white p-2 rounded hover:bg-gray-600"
              >
                Close
              </button>
            </div>
            {selectedMedia.fileType === "image" ? (
              <Image
                src={selectedMedia.url}
                alt={selectedMedia.fileKey}
                width={800} // Adjust based on your design
                height={600} // Adjust based on your design
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