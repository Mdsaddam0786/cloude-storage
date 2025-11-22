import React, { useEffect, useState } from 'react';
import api from '../api';
import UploadArea from '../components/UploadArea';
import FileExplorer from '../components/FileExplorer';
import ShareModal from '../components/ShareModal';
import axios from 'axios';

export default function Home() {
  const [files, setFiles] = useState([]);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [shareFile, setShareFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);

  const fetchUser = async () => {
    try {
      const res = await api.get('/auth/me');
      setUser(res.data);
    } catch (err) {
      console.error('❌ Error fetching user:', err);
    }
  };

  const handleProfileUpdate = async (e) => {
    e.preventDefault();

    const formData = new FormData(e.target);

    try {
      await api.put('/auth/profile', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      alert('Profile updated!');
      await fetchUser(); // ✅ Refresh user data instantly
      setShowProfileModal(false); // ✅ Close modal
    } catch (err) {
      console.error('❌ Profile update error:', err);
    }
  };

  const handleDelete = async (id) => {
    try {
      const res = await api.delete(`/files/${id}`);
      if (res.data.success) {
        setFiles((prev) => prev.filter((f) => f._id !== id));
      }
    } catch (err) {
      console.error('Delete error:', err);
      setError('❌ Failed to delete file.');
    }
  };

  const handleRename = async (file) => {
    const newName = prompt('Rename file:', file.fileName);
    if (newName?.trim()) {
      try {
        await api.patch(`/files/${file._id}/rename`, { newName });
        fetchFiles();
      } catch (err) {
        console.error('Rename error:', err);
        setError('❌ Failed to rename file.');
      }
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.reload();
  };

  const fetchFiles = async () => {
    try {
      const res = await api.get('/files');
      const allFiles = res.data || [];
      setFiles(allFiles);

      const pending = allFiles.filter(
        (file) => !file.tags || file.tags.length === 0,
      );
      setPendingFiles(pending);

      if (pending.length > 0) {
        console.log(
          '⏳ Pending tags:',
          pending.map((f) => f.fileName),
        );
      } else {
        console.log('✅ All files have AI tags!');
      }

      return allFiles;
    } catch (err) {
      console.error('❌ Error fetching files:', err);
      return [];
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (
      !window.confirm(
        'Are you sure you want to delete your account? This cannot be undone.',
      )
    )
      return;

    try {
      await api.delete('/auth/delete'); // Matches backend route
      localStorage.removeItem('token');
      alert('Your account has been deleted.');
      window.location.href = '/login';
    } catch (err) {
      console.error('❌ Delete account error:', err);
      alert('Failed to delete account.');
    }
  };

  useEffect(() => {
    fetchUser();
    let intervalId;
    let startTime = Date.now();

    const initLoad = async () => {
      setLoading(true);
      const data = await fetchFiles();

      const hasPendingTags = data.some(
        (f) => !f.ai_tags || f.ai_tags.length === 0,
      );
      if (hasPendingTags) {
        intervalId = setInterval(async () => {
          const updated = await fetchFiles();
          const stillPending = updated.some(
            (f) => !f.ai_tags || f.ai_tags.length === 0,
          );

          if (!stillPending || (Date.now() - startTime) / 1000 > 120) {
            clearInterval(intervalId);
          }
        }, 10000);
      }
    };

    initLoad();
    return () => intervalId && clearInterval(intervalId);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100 to-gray-200">
      {/* Header */}
      <header className="bg-white shadow-sm p-4 flex justify-between items-center sticky top-0 z-10">
        <h1 className="text-2xl font-semibold text-gray-800">
          ☁️ Saddam&apos;s Cloud Storage
        </h1>
        <div className="flex items-center space-x-4">
          {user?.photo && (
            <img
              src={user.photo}
              alt="Profile"
              className="w-10 h-10 rounded-full object-cover border"
            />
          )}
          <span className="text-gray-700">{user?.name}</span>
          <button
            onClick={() => setShowProfileModal(true)}
            className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded">
            Edit Profile
          </button>
          <button
            onClick={handleLogout}
            className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded">
            Logout
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto p-6 space-y-6">
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
            {error}
            <button
              onClick={() => setError('')}
              className="absolute top-1 right-2 text-red-500 hover:text-red-700">
              &times;
            </button>
          </div>
        )}

        <div className="bg-white p-4 rounded shadow">
          <UploadArea onUpload={fetchFiles} />
        </div>

        <div className="bg-white rounded shadow p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500"></div>
              <span className="ml-3 text-gray-500">Loading files...</span>
            </div>
          ) : files.length === 0 ? (
            <p className="text-gray-500 text-center py-4">
              No files uploaded yet.
            </p>
          ) : (
            <>
              <div className="mb-2 text-sm text-gray-600">
                Showing {files.length} file{files.length > 1 ? 's' : ''}
              </div>
              <FileExplorer
                files={files}
                onDelete={handleDelete}
                onRename={handleRename}
                onShare={setShareFile}
              />
            </>
          )}
        </div>

        <ShareModal
          file={shareFile}
          onClose={() => setShareFile(null)}
        />
      </main>

      {/* Profile Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <form
            onSubmit={handleProfileUpdate}
            encType="multipart/form-data"
            className="bg-white p-6 rounded shadow-lg w-full max-w-md space-y-4">
            <h2 className="text-xl font-bold mb-4">Update Profile</h2>
            <input
              name="name"
              defaultValue={user?.name}
              className="w-full border p-2 rounded"
              placeholder="Name"
            />
            <input
              name="email"
              defaultValue={user?.email}
              className="w-full border p-2 rounded"
              placeholder="Email"
              type="email"
            />
            <input
              name="mobile"
              defaultValue={user?.mobile}
              className="w-full border p-2 rounded"
              placeholder="Mobile"
            />
            <input
              name="password"
              className="w-full border p-2 rounded"
              placeholder="New Password"
              type="password"
            />
            <input
              name="profilePhoto"
              type="file"
              className="w-full border p-2 rounded"
            />
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                className="px-4 py-2 bg-gray-300 rounded">
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-500 text-white rounded">
                Save
              </button>
            </div>
          </form>
        </div>
      )}
      <button
        onClick={handleDeleteAccount}
        className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700">
        Delete Account
      </button>
    </div>
  );
}
