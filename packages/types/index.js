/**
 * @typedef {'spotify' | 'ytmusic'} Platform
 *
 * @typedef {Object} Track
 * @property {string} id
 * @property {string} name
 * @property {string} artist
 * @property {string} album
 * @property {number} duration_ms
 * @property {string} [thumbnail]
 * @property {'found' | 'fuzzy' | 'miss'} [matchStatus]
 * @property {string} [matchedId]
 *
 * @typedef {Object} Playlist
 * @property {string} id
 * @property {string} name
 * @property {string} owner
 * @property {string} [thumbnail]
 * @property {number} trackCount
 * @property {Platform} sourcePlatform
 * @property {Track[]} tracks
 *
 * @typedef {Object} TransferJob
 * @property {string} jobId
 * @property {Platform} from
 * @property {Platform} to
 * @property {string[]} selectedTrackIds
 * @property {TransferOptions} options
 * @property {'queued' | 'running' | 'done' | 'error'} status
 * @property {number} progress
 * @property {string} [recipientEmail]
 * @property {string} [shareToken]
 *
 * @typedef {Object} TransferOptions
 * @property {boolean} exactMatchOnly
 * @property {boolean} preserveOrder
 * @property {boolean} skipDuplicates
 * @property {boolean} makePublic
 *
 * @typedef {Object} SSEEvent
 * @property {'track_done' | 'track_miss' | 'progress' | 'complete' | 'error'} type
 * @property {number} done
 * @property {number} total
 * @property {string} [trackName]
 * @property {string} [error]
 */

module.exports = {};
