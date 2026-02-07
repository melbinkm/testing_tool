import axios from 'axios';

const FOLDER_OPENER_URL = 'http://localhost:9876';

/**
 * Open a folder in the host's file explorer (Finder on macOS, etc.)
 * Uses the local folder_opener.py service running on the host
 * 
 * @param {string} path - Absolute path to the folder
 * @returns {Promise<{success: boolean, path: string, os: string}>}
 */
export const openFolderOnHost = async (path) => {
    try {
        const response = await axios.post(`${FOLDER_OPENER_URL}/open`, { path }, {
            timeout: 3000  // 3 second timeout
        });
        return response.data;
    } catch (error) {
        if (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK') {
            throw new Error('Folder opener service not running. Start it with: python3 tools/folder_opener.py');
        }
        throw error;
    }
};

/**
 * Check if the folder opener service is available
 * @returns {Promise<boolean>}
 */
export const isFolderOpenerAvailable = async () => {
    try {
        await axios.options(`${FOLDER_OPENER_URL}/open`, { timeout: 1000 });
        return true;
    } catch {
        return false;
    }
};

export default {
    openFolderOnHost,
    isFolderOpenerAvailable
};
