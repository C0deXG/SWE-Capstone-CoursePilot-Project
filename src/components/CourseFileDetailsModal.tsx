import { Check, ExternalLink, Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useAppData } from "../context/AppDataContext";
import type { CourseFile, ReviewItem, ReviewStatus } from "../types";
import { Modal, StatusPill } from "./ui";

export function CourseFileDetailsModal({ file, onClose }: { file: CourseFile; onClose: () => void }) {
  const data = useAppData();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const reviews = data.reviews.filter((review) => review.fileId === file.id && !review.requiredForSetup && ["Needs review", "Deferred"].includes(review.status));

  async function openSource() {
    const url = await data.getFileUrl(file.id);
    if (!url) {
      setNotice("The secure source link could not be created. Try again in a moment.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function resolve(status: ReviewStatus, value?: string) {
    const review = reviews[0];
    if (!review) return;
    data.resolveReview(review.id, status, value);
    if (reviews.length === 1) data.updateFile(file.id, { status: "Accepted" });
  }

  return <><Modal open title={file.filename} description="File details and processing status." onClose={onClose}><div className="modal-body"><dl className="detail-list"><div><dt>File format</dt><dd>{file.fileType}</dd></div><div><dt>Document purpose</dt><dd>{file.documentType === "unclassified" ? "Classifying" : file.documentType.replaceAll("_", " ")}</dd></div><div><dt>How it is used</dt><dd>{file.authorityLevel === "authoritative" ? "Updates course-wide information" : file.authorityLevel === "supporting" ? "Supports assignment details" : "Searchable learning source"}</dd></div><div><dt>Size</dt><dd>{file.size}</dd></div><div><dt>Uploaded</dt><dd>{file.uploadedAt}</dd></div><div><dt>Pages</dt><dd>{file.pageCount || "Not available"}</dd></div><div><dt>Status</dt><dd><StatusPill tone={file.status === "Accepted" ? "success" : file.status === "Failed" ? "danger" : file.status === "Needs review" ? "warning" : "neutral"}>{file.status}</StatusPill></dd></div></dl>{notice && <p className="flow-note" role="status">{notice}</p>}{reviews[0] && <FileReviewCard key={reviews[0].id} review={reviews[0]} remaining={reviews.length} onResolve={resolve} />}</div><footer className="modal-actions split-actions"><button className="button danger-text" type="button" onClick={() => setDeleteOpen(true)}><Trash2 size={14} /> Delete file</button><div><button className="button" type="button" onClick={onClose}>Close</button><button className="button primary" type="button" onClick={() => void openSource()}><ExternalLink size={14} /> Open source</button></div></footer></Modal><Modal open={deleteOpen} title="Delete file?" description="Assignments remain, but their source link will be removed." size="small" onClose={() => setDeleteOpen(false)}><div className="modal-body"><p>Delete <strong>{file.filename}</strong> and its searchable source data?</p></div><footer className="modal-actions"><button className="button" type="button" onClick={() => setDeleteOpen(false)}>Cancel</button><button className="button danger" type="button" onClick={() => { data.removeFile(file.id); setDeleteOpen(false); onClose(); }}><Trash2 size={14} /> Delete file</button></footer></Modal></>;
}

function FileReviewCard({ review, remaining, onResolve }: { review: ReviewItem; remaining: number; onResolve: (status: ReviewStatus, value?: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(review.extractedValue);
  return <section className="file-review-block"><div className="course-review-heading"><div><p className="eyebrow">Check this upload</p><h3>{review.question}</h3></div><StatusPill tone="warning">{remaining} remaining</StatusPill></div><div className="evidence-grid"><div><span>Extracted value</span>{editing ? <input value={value} onChange={(event) => setValue(event.target.value)} autoFocus /> : <strong>{review.extractedValue}</strong>}</div><div><span>Source</span><strong>{review.sourceReference}</strong><small>{review.confidence} confidence</small></div></div><div className="review-inline-actions">{editing ? <><button className="button" type="button" onClick={() => setEditing(false)}>Cancel</button><button className="button primary" type="button" onClick={() => onResolve("Edited", value)}><Check size={14} /> Save</button></> : <><button className="button" type="button" onClick={() => onResolve("Rejected")}><X size={14} /> Reject</button><button className="button" type="button" onClick={() => setEditing(true)}><Pencil size={14} /> Edit</button><button className="button primary" type="button" onClick={() => onResolve("Accepted")}><Check size={14} /> Accept</button></>}</div></section>;
}
