"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
  pinned?: boolean; // Add pinned property to MediaItem type
};

export default function GalleryPage() {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const router = useRouter();
  const modalRef = useRef<HTMLDivElement>(null); // For focus trapping in the modal
  const observer = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const LIMIT = 12; // Number of items to fetch per page

  // Fetch media from API with pagination.
  // If you want to fetch only pinned media, you can add "&pinned=true" to the URL.
  const fetchMedia = useCallback(async () => {
    setIsFetching(true);
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/");
      return;
    }
    try {
      const response = await fetch(`/api/media?page=${page}&limit=${LIMIT}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        let errorData;
        if (contentType && contentType.includes("application/json")) {
          errorData = await response.json();
          throw new Error(errorData.error || "Failed to fetch media");
        } else {
          const text = await response.text();
          throw new Error(`Failed to fetch media: ${text}`);
        }
      }
      const data: MediaItem[] = await response.json();

      // If API returns all items every time instead of paginated,
      // filter out duplicates based on fileKey.
      setMedia((prev) => {
        const combined = page === 1 ? data : [...prev, ...data];
        // Remove duplicate items based on fileKey
        const unique = combined.filter(
          (item, index, self) =>
            index === self.findIndex((t) => t.fileKey === item.fileKey)
        );
        // Sort items by uploadDate descending (most recent first)
        unique.sort(
          (a, b) =>
            new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()
        );
        return unique;
      });

      if (data.length < LIMIT) {
        setHasMore(false);
      }
    } catch (err) {
      console.error("Fetch error:", err);
      setError((err as Error).message || "An error occurred");
    } finally {
      setLoading(false);
      setIsFetching(false);
    }
  }, [page, router]);

  // Initial fetch and subsequent page fetches
  useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  // Set up IntersectionObserver on the sentinel
  useEffect(() => {
    if (isFetching) return;
    if (!hasMore) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setPage((prevPage) => prevPage + 1);
        }
      },
      {
        root: null,
        rootMargin: "20px",
        threshold: 1.0,
      }
    );
    if (sentinelRef.current) {
      observer.current.observe(sentinelRef.current);
    }
    return () => {
      if (observer.current) observer.current.disconnect();
    };
  }, [isFetching, hasMore]);

  const openModal = (item: MediaItem) => {
    setSelectedMedia(item);
  };

  const closeModal = () => {
    setSelectedMedia(null);
  };

  const handleDelete = async () => {
    if (!selectedMedia) return;
    try {
      const token = localStorage.getItem("token");
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
      setMedia((prev) =>
        prev.filter((item) => item.fileKey !== selectedMedia.fileKey)
      );
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

  const handleNext = () => {
    if (!selectedMedia) return;
    const currentIndex = media.findIndex(
      (item) => item.fileKey === selectedMedia.fileKey
    );
    // Move to the next item; wraps around to the start if at the end
    const nextIndex = (currentIndex + 1) % media.length;
    setSelectedMedia(media[nextIndex]);
  };

  const handlePrevious = () => {
    if (!selectedMedia) return;
    const currentIndex = media.findIndex(
      (item) => item.fileKey === selectedMedia.fileKey
    );
    // Move to the previous item; wraps around to the end if at the beginning
    const prevIndex = (currentIndex - 1 + media.length) % media.length;
    setSelectedMedia(media[prevIndex]);
  };

  // Handler for pinning a media item
  const handlePin = async () => {
    if (!selectedMedia) return;
    const token = localStorage.getItem("token");
    if (!token) return;
  
    try {
      const response = await fetch(`/api/media/pin?fileKey=${selectedMedia.fileKey}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to pin image");
      }
      // Update the selectedMedia state and media list to reflect the new pinned status.
      setSelectedMedia({ ...selectedMedia, pinned: true });
      setMedia((prev) =>
        prev.map((item) =>
          item.fileKey === selectedMedia.fileKey ? { ...item, pinned: true } : item
        )
      );
      toast.success("Image pinned successfully");
    } catch (err) {
      console.error(err);
      toast.error((err as Error).message || "Failed to pin image");
    }
  };

  // New handler for unpinning a media item
  const handleUnpin = async (fileKey: string) => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const response = await fetch(`/api/media/unpin?fileKey=${fileKey}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to unpin image");
      }
      // Update state to mark the media as unpinned.
      setMedia((prev) =>
        prev.map((item) =>
          item.fileKey === fileKey ? { ...item, pinned: false } : item
        )
      );
      if (selectedMedia && selectedMedia.fileKey === fileKey) {
        setSelectedMedia({ ...selectedMedia, pinned: false });
      }
      toast.success("Image unpinned successfully");
    } catch (err) {
      console.error(err);
      toast.error((err as Error).message || "Failed to unpin image");
    }
  };

  // If you want the gallery to show only pinned media, uncomment the following line:
  // const displayedMedia = media.filter((item) => item.pinned);
  // Otherwise, use all media:
  const displayedMedia = media;

  if (loading && page === 1) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-500">
        {error}
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 bg-gray-100">
      <ToastContainer />
      <h1 className="text-3xl font-bold text-center mb-8">My Media Gallery</h1>
      <button
        onClick={() => {
          router.push("/dashboard");
        }}
        className="mb-4 bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
      >
        Back to Dashboard
      </button>
      <div className="grid grid-cols-3 sm:grid-cols-6 md:grid-cols-8 gap-2">
        {displayedMedia.length === 0 ? (
          <p className="text-center col-span-full">
            No media found. Upload some images or videos from the dashboard!
          </p>
        ) : (
          displayedMedia.map((item) => (
            <div
              key={item.fileKey}
              className="bg-white p-1 rounded shadow-md cursor-pointer"
              onClick={() => openModal(item)}
            >
              {item.fileType.startsWith("image") ? (
                <div className="relative w-full aspect-square">
                  <Image
                    // Use previewKey if available, otherwise fallback to the original URL.
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
      {/* Sentinel element for infinite scroll */}
      <div ref={sentinelRef} className="h-4" />

      {/* Modal for viewing full media */}
      {selectedMedia && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeModal();
            }
          }}
        >
          <div
            ref={modalRef}
            className="relative bg-white p-4 rounded max-w-3xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Navigation Buttons for Previous and Next */}
            <div
              className="absolute left-2 top-1/2 transform -translate-y-1/2 z-50"
              onClick={(e) => {
                e.stopPropagation();
                handlePrevious();
              }}
            >
              <button className="bg-gray-700 text-white p-2 rounded-full">
                &#8249;
              </button>
            </div>
            <div
              className="absolute right-2 top-1/2 transform -translate-y-1/2 z-50"
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
            >
              <button className="bg-gray-700 text-white p-2 rounded-full">
                &#8250;
              </button>
            </div>

            {/* New Pin/Unpin, Delete and Close Buttons */}
            <div className="absolute top-2 right-2 flex space-x-2 z-50">
              <button
                onClick={handleDelete}
                className="bg-red-500 text-white p-2 rounded hover:bg-red-600"
              >
                Delete
              </button>
              {/* Conditionally render Pin/Unpin button */}
              {selectedMedia.pinned ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUnpin(selectedMedia.fileKey);
                  }}
                  className="bg-red-500 text-white p-2 rounded hover:bg-red-600"
                >
                  Unpin
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePin();
                  }}
                  className="bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
                >
                  Pin
                </button>
              )}
              <button
                onClick={closeModal}
                className="bg-gray-500 text-white p-2 rounded hover:bg-gray-600"
              >
                Close
              </button>
            </div>

            {/* Media Display */}
            {selectedMedia.fileType.startsWith("image") ? (
              <Image
                src={selectedMedia.url}
                alt={selectedMedia.fileKey}
                layout="responsive"
                width={16}
                height={9}
                className="object-cover rounded"
              />
            ) : (
              <video
                src={selectedMedia.url}
                controls
                className="w-full h-auto max-h-[80vh] object-contain"
              />
            )}

            {/* Social Share Buttons */}
            <div className="flex space-x-2 mt-4 justify-center">
              <a
                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                  "Check out this media: " + selectedMedia.url
                )}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <button className="bg-green-500 text-white p-2 rounded hover:bg-green-600">
                  Share on WhatsApp
                </button>
              </a>
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
                  selectedMedia.url
                )}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <button className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700">
                  Share on Facebook
                </button>
              </a>
            </div>
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
