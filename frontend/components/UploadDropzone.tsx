"use client";

import { DragEvent, useState } from "react";

type UploadDropzoneProps = {
  onFile: (file: File) => void;
};

export default function UploadDropzone({ onFile }: UploadDropzoneProps) {
  const [filename, setFilename] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = (file?: File) => {
    if (!file) return;
    setFilename(file.name);
    onFile(file);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    handleFile(event.dataTransfer.files?.[0]);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
      style={{
        border: `2px dashed ${isDragging ? "#2563eb" : "#9ca3af"}`,
        borderRadius: 10,
        background: "#fff",
        padding: 20,
      }}
    >
      <p style={{ marginTop: 0 }}>Drag and drop a CSV file, or use file picker.</p>
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(event) => handleFile(event.target.files?.[0])}
      />
      {filename && <p style={{ marginBottom: 0 }}>Selected file: {filename}</p>}
    </div>
  );
}
