/**
 * Context Documents Panel - Upload and manage user-provided context documents
 */
import { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { Upload, X } from 'lucide-react';
import {
    uploadContextDocument,
    listContextDocuments,
    deleteContextDocument
} from '../../services/contextService';

const ContextDocumentsPanel = ({ assessmentId }) => {
    const [documents, setDocuments] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef(null);

    useEffect(() => {
        loadDocuments();
    }, [assessmentId]);

    const loadDocuments = async () => {
        try {
            const docs = await listContextDocuments(assessmentId);
            setDocuments(docs);
        } catch (err) {
            console.error('Failed to load context documents:', err);
        }
    };

    const handleFileSelect = async (files) => {
        if (!files || files.length === 0) return;

        setUploading(true);

        try {
            const file = files[0];

            const maxSize = 10 * 1024 * 1024; // 10MB
            if (file.size > maxSize) {
                alert(`File size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds 10MB limit`);
                return;
            }

            await uploadContextDocument(assessmentId, file);
            await loadDocuments();
        } catch (err) {
            alert(err.response?.data?.detail || err.message || 'Upload failed');
        } finally {
            setUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleDelete = async (filename) => {
        if (!window.confirm(`Delete ${filename}?`)) return;

        try {
            await deleteContextDocument(assessmentId, filename);
            await loadDocuments();
        } catch (err) {
            alert(err.response?.data?.detail || 'Delete failed');
        }
    };

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileSelect(e.dataTransfer.files);
        }
    };


    return (
        <div>
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                    Context Documents
                    {documents.length > 0 && (
                        <span className="ml-2 text-xs font-normal text-neutral-500 dark:text-neutral-400">({documents.length})</span>
                    )}
                </h3>
            </div>

            <div className="border border-neutral-200 dark:border-neutral-700 rounded overflow-hidden">
                {/* Upload Zone */}
                <div
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    className={`border-b border-neutral-200 dark:border-neutral-700 p-4 text-center transition-colors ${dragActive
                        ? 'bg-blue-50 dark:bg-blue-900/20'
                        : 'bg-neutral-50/50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-700/50'
                        }`}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
                        className="sr-only"
                        id="context-file-upload"
                        disabled={uploading}
                    />

                    <label
                        htmlFor="context-file-upload"
                        className="cursor-pointer flex flex-col items-center gap-2"
                    >
                        <Upload className={`w-5 h-5 ${dragActive ? 'text-blue-600' : 'text-neutral-400'}`} />
                        <div>
                            <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                                {uploading ? 'Uploading...' : dragActive ? 'Drop file here' : 'Click to upload or drag and drop'}
                            </p>
                            <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                                PDF, TXT, JSON, YAML, Images (max 10MB)
                            </p>
                        </div>
                    </label>

                    {uploading && (
                        <div className="mt-2">
                            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                        </div>
                    )}
                </div>

                {/* Documents List */}
                {documents.length > 0 ? (
                    <table className="w-full text-xs">
                        <tbody>
                            {documents.map((doc) => (
                                <tr
                                    key={doc.filename}
                                    className="border-b border-neutral-100 dark:border-neutral-700 last:border-b-0 hover:bg-neutral-50/50 dark:hover:bg-neutral-700/50"
                                >
                                    <td className="px-3 py-2">
                                        <div className="flex items-center gap-2">
                                            <div>
                                                <p className="font-mono text-neutral-900 dark:text-neutral-100">
                                                    {doc.filename}
                                                </p>
                                                <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                                                    {doc.type} • {doc.size_human}
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-2 py-2 w-px">
                                        <button
                                            onClick={() => handleDelete(doc.filename)}
                                            className="p-0.5 hover:bg-red-50 dark:hover:bg-red-900/30 rounded text-neutral-300 dark:text-neutral-600 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                                            title="Delete"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div className="px-3 py-4 text-center text-xs text-neutral-500 dark:text-neutral-400">
                        No context documents uploaded yet
                    </div>
                )}
            </div>

            {/* Info Note */}
            <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-2">
                Files are stored in <code className="px-1 bg-neutral-100 dark:bg-neutral-700 rounded font-mono">/context</code> and visible to Claude when loading this assessment.
            </p>
        </div>
    );
};

ContextDocumentsPanel.propTypes = {
    assessmentId: PropTypes.number.isRequired,
};

export default ContextDocumentsPanel;
