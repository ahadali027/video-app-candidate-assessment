import React, { useState, useEffect, useRef } from 'react';
import { StoreContext } from '../../mobx';
import styles from './Timeline.module.scss';
import TimelineRow from './TimelineRow';
import { AnimationsPanel } from 'components/PlayerComponent/panels/AnimationsPanel';
import { observer } from 'mobx-react';
import TimelineGhostElement from './TimelineGhostElement';
import AlignmentLines from './AlignmentLines';
import GhostMarker from './GhostMarker';
import InterRowDropZone from './InterRowDropZone';
import TimelineRuler from './TimelineRuler';
import toast from 'react-hot-toast';
import { validateFile, detectCategory } from '../../utils/fileValidation';
import { uploadFile } from '../../services/fileUploadService';
import { getVideoMetadataFromUrl } from '../../utils/videoMetadata';

const TimelineGrid = observer(
  ({
    overlays,
    toggleAnimations,
    moveElementBetweenRows,
    isAnimationsVisible,
    handleActiveScene,
    animationsPanelRow,
    storyData,
    scale,
    defaultButton,
    isCutMode,
    setIsCutMode,
    scenes,
    onOpenTransitionPanel,
    onOpenEffectPanel,
  }) => {
    const store = React.useContext(StoreContext);
    const gridRef = useRef(null);
    const [isDraggingOver, setIsDraggingOver] = useState(false);

    const rows = Array.from({ length: store.maxRows });

    const getAudioDurationSeconds = file => {
      return new Promise((resolve, reject) => {
        const audio = new Audio();
        audio.preload = 'metadata';

        const audioUrl = URL.createObjectURL(file);
        audio.src = audioUrl;

        audio.onloadedmetadata = () => {
          URL.revokeObjectURL(audioUrl);
          resolve(audio.duration || 0);
        };

        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl);
          reject(new Error('Audio file upload error'));
        };

        setTimeout(() => {
          if (!audio.duration) {
            URL.revokeObjectURL(audioUrl);
            reject(new Error('Audio duration determination timeout'));
          }
        }, 5000);
      });
    };

    const inferUploadCategory = file => {
      const ft = (file.type || '').toLowerCase();
      if (ft.startsWith('image/')) return 'image';
      if (ft.startsWith('video/')) return 'video';
      if (ft.startsWith('audio/')) return 'audio';
      const n = (file.name || '').toLowerCase();
      if (/\.(png|jpe?g|gif|bmp|webp|svg)$/.test(n)) return 'image';
      if (/\.(mp4|avi|mov|wmv|flv|webm|mkv|m4v)$/.test(n)) return 'video';
      if (/\.(mp3|wav|ogg|aac|flac|aiff|m4a)$/i.test(n)) return 'audio';
      return null;
    };

    // Use shared video metadata utility for consistent audio detection

    const handleDragOver = e => {
      e.preventDefault();
      const item = e.dataTransfer?.items?.[0];
      if (!item || item.kind !== 'file') return;

      const type = (item.type || '').toLowerCase();
      const isMedia =
        type.startsWith('audio/') ||
        type.startsWith('video/') ||
        type.startsWith('image/');

      setIsDraggingOver(isMedia);
      if (isMedia && e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };

    const handleDragLeave = e => {
      e.preventDefault();
      setIsDraggingOver(false);
    };

    const handleDrop = async e => {
      e.preventDefault();
      setIsDraggingOver(false);

      const droppedFiles = Array.from(e.dataTransfer.files || []);
      if (!droppedFiles.length) return;

      try {
        const mediaFiles = droppedFiles.filter(file => {
          const type = (file.type || '').toLowerCase();
          const name = (file.name || '').toLowerCase();
          const isMediaMime =
            type.startsWith('audio/') ||
            type.startsWith('video/') ||
            type.startsWith('image/');
          const isMediaExt = /\.(mp3|wav|ogg|aac|m4a|flac|aiff|mp4|mov|webm|avi|mkv|m4v|wmv|png|jpe?g|gif|bmp|webp|svg)$/i.test(
            name
          );
          return isMediaMime || isMediaExt;
        });

        if (!mediaFiles.length) {
          toast.error('Unsupported file type. Please drop image, video, or audio files.');
          return;
        }

        const accepted = [];
        const rejected = [];

        for (const file of mediaFiles) {
          const res = validateFile(file, 'All');
          if (res.ok) accepted.push(file);
          else rejected.push({ file, reason: res.reason });
        }

        if (rejected.length) {
          const head = rejected
            .slice(0, 3)
            .map(r => `${r.file.name} — ${r.reason}`)
            .join(', ');
          toast.error(
            `Some files were rejected: ${head}${rejected.length > 3 ? '…' : ''}`
          );
        }

        if (!accepted.length) return;

        // Same method as upload: end bar placement, dedicated rows per type (no combine)
        const lastVideoEnd = () => store.getLastVideoEndTime();
        const lastAudioEnd = () => store.getLastAudioEndTime();

        for (const file of accepted) {
          const category = detectCategory(file) || inferUploadCategory(file);
          const logicalType = (category || '').toLowerCase();

          if (!logicalType) {
            toast.error(`Unsupported file type: ${file.name}`);
            continue;
          }

          try {
            const uploadType =
              logicalType === 'image' || logicalType === 'animation'
                ? 'image'
                : logicalType === 'video'
                ? 'video'
                : logicalType === 'audio'
                ? 'audio'
                : null;

            if (!uploadType) {
              toast.error(`Unsupported file type: ${file.name}`);
              continue;
            }

            const uploadResult = await uploadFile(file, { type: uploadType });
            const uploadedUrl =
              uploadResult?.url ||
              uploadResult?.file?.url ||
              URL.createObjectURL(file);

            if (uploadType === 'image') {
              const imageRow = store.getDedicatedImageTrackRow();
              if (imageRow >= store.maxRows) store.maxRows = imageRow + 1;
              // CRITICAL: Place new image AFTER the last image on the same track (sequential)
              const lastImageEndTime = store.getLastImageEndTime(imageRow);
              const startTime = lastImageEndTime; // Start after last image ends
              await store.addImageLocal({
                url: uploadedUrl,
                minUrl: uploadResult?.thumbnail || uploadedUrl,
                row: imageRow,
                startTime,
              });
              toast.success(`Added ${file.name} to timeline (after ${(lastImageEndTime / 1000).toFixed(1)}s)`);
            } else if (uploadType === 'audio') {
              let durationMs = 5000;
              if (typeof uploadResult?.duration === 'number') {
                durationMs = uploadResult.duration * 1000;
              } else {
                try {
                  const durationSec = await getAudioDurationSeconds(file);
                  durationMs = Math.max(1000, durationSec * 1000);
                } catch {
                  durationMs = 5000;
                }
              }
              const audioRow = store.getDedicatedAudioTrackRow();
              if (audioRow >= store.maxRows) store.maxRows = audioRow + 1;
              const startTime = lastAudioEnd(); // end bar (same method as upload)
              await store.addExistingAudio({
                base64Audio: uploadedUrl,
                durationMs,
                row: audioRow,
                startTime,
                audioType: 'music',
                duration: durationMs,
                id: Date.now() + Math.random().toString(36).substring(2, 9),
                name: file.name,
              });
              toast.success(`Added ${file.name} to timeline`);
            } else if (uploadType === 'video') {
              // Determine accurate duration and whether the video actually has an audio track.
              // Never assume "hasAudio" based solely on backend duration metadata.
              let durationMs;
              let hasAudio = false;

              try {
                const meta = await getVideoMetadataFromUrl(uploadedUrl);
                durationMs = meta?.durationMs;
                hasAudio = !!meta?.hasAudio;
                console.log(`[Drag-Drop] Video metadata for ${file.name}:`, {
                  durationMs,
                  hasAudio,
                  url: uploadedUrl.substring(0, 50) + '...'
                });
              } catch (err) {
                console.warn(`[Drag-Drop] Video metadata detection failed for ${file.name}:`, err);
                // Fallback: use backend-reported duration when metadata probe fails
                if (typeof uploadResult?.duration === 'number') {
                  durationMs = uploadResult.duration * 1000;
                } else {
                  // Reasonable default duration if nothing else is available
                  durationMs = 10000;
                }
                // In fallback path we conservatively assume "no audio"
                hasAudio = false;
              }

              // Same method as upload: dedicated rows, end bar placement
              const videoRow = store.getDedicatedVideoTrackRow();
              let audioRow = store.getDedicatedAudioTrackRow();
              
              // CRITICAL: Ensure audio row is ALWAYS different from video row
              if (audioRow === videoRow && hasAudio) {
                // Find next available row for audio
                audioRow = Math.max(videoRow + 1, store.maxRows);
              }
              
              if (videoRow >= store.maxRows) store.maxRows = videoRow + 1;
              if (hasAudio && audioRow >= store.maxRows) store.maxRows = audioRow + 1;
              const alignedStartTime = lastVideoEnd(); // end bar (where video's last part)

              await store.handleVideoUploadFromUrl({
                url: uploadedUrl,
                title: file.name,
                key: uploadResult?.key || null,
                duration: durationMs,
                row: videoRow, // Dedicated video track
                startTime: alignedStartTime,
                isNeedLoader: false,
                hasSeparateAudio: hasAudio, // Pass flag to mute video if audio is extracted
              });

              // Add aligned audio clip if video has audio - CRITICAL: Separate audio track
              if (hasAudio) {
                try {
                  await store.addExistingAudio({
                    base64Audio: uploadedUrl,
                    durationMs,
                    row: audioRow, // Dedicated audio track (separate from video)
                    startTime: alignedStartTime, // Same start time as video for perfect alignment
                    audioType: 'music',
                    duration: durationMs, // Same duration as video
                    id: Date.now() + Math.random().toString(36).substring(2, 9),
                    name: file.name,
                  });
                  console.log(`[Drag-Drop] Successfully added audio track for ${file.name} on row ${audioRow}`);
                } catch (audioError) {
                  console.error(`[Drag-Drop] Failed to add audio track for ${file.name}:`, audioError);
                  toast.error(`Video added but audio extraction failed for ${file.name}`);
                }
              } else {
                console.log(`[Drag-Drop] Video ${file.name} has no audio track - skipping audio extraction`);
              }

              toast.success(
                hasAudio
                  ? `Added video and audio from ${file.name} to timeline (aligned, separate tracks)`
                  : `Added video ${file.name} to timeline`
              );
            }
          } catch (err) {
            console.error('Drag and drop upload error:', err);
            toast.error(`Failed to upload ${file.name}`);
          }
        }

        store.refreshElements();
      } catch (error) {
        console.error('Drag and drop processing error:', error);
        toast.error('Failed to process dropped files');
      }
    };

    useEffect(() => {
      const grid = gridRef.current;
      if (!grid) return;

      grid.addEventListener('dragover', handleDragOver);
      grid.addEventListener('dragleave', handleDragLeave);
      grid.addEventListener('drop', handleDrop);

      return () => {
        grid.removeEventListener('dragover', handleDragOver);
        grid.removeEventListener('dragleave', handleDragLeave);
        grid.removeEventListener('drop', handleDrop);
      };
    }, [store, storyData]);

    // Global mouse tracking for all ghost types
    useEffect(() => {
      const handleGlobalMouseMove = e => {
        // Check if mouse is over the timeline grid for timeline element ghosts
        const timelineGrid = gridRef.current;
        if (!timelineGrid) return;

        const gridRect = timelineGrid.getBoundingClientRect();
        const isOverGrid =
          e.clientX >= gridRect.left &&
          e.clientX <= gridRect.right &&
          e.clientY >= gridRect.top &&
          e.clientY <= gridRect.bottom;

        // Hide timeline element ghosts if mouse is outside the timeline grid
        if (!isOverGrid) {
          // For file/gallery drags, fully reset to avoid stuck states
          if (
            store.ghostState.isFileDragging ||
            store.ghostState.isGalleryDragging
          ) {
            store.resetGhostState();
          } else {
            if (store.ghostState.isDragging) {
              store.ghostState.ghostElement = null;
            }
            if (store.ghostState.isMultiDragging) {
              store.ghostState.multiGhostElements = [];
            }
          }
        }
      };

      const handleGlobalDragOver = e => {
        // Check if mouse is over the timeline grid
        const timelineGrid = gridRef.current;
        if (!timelineGrid) return;

        const gridRect = timelineGrid.getBoundingClientRect();
        const isOverGrid =
          e.clientX >= gridRect.left &&
          e.clientX <= gridRect.right &&
          e.clientY >= gridRect.top &&
          e.clientY <= gridRect.bottom;

        // Hide all ghosts if mouse is outside the timeline grid
        if (!isOverGrid) {
          // For file/gallery drags, fully reset to avoid stuck states
          if (
            store.ghostState.isFileDragging ||
            store.ghostState.isGalleryDragging
          ) {
            store.resetGhostState();
          } else {
            if (store.ghostState.isDragging) {
              store.ghostState.ghostElement = null;
            }
            if (store.ghostState.isMultiDragging) {
              store.ghostState.multiGhostElements = [];
            }
          }
          return;
        }

        if (
          store.ghostState.isFileDragging &&
          e.dataTransfer?.types.includes('Files')
        ) {
          // Only handle if not over a specific timeline row (let row handlers take priority)
          const timelineRow = e.target.closest('[data-testid="timeline-row"]');
          if (timelineRow) {
            return; // Let TimelineRow handler deal with it
          }

          e.preventDefault();

          const mouseX = e.clientX - gridRect.left;
          const newPosition = (mouseX / gridRect.width) * store.maxTime;

          // Find which row we're hovering over
          const rowContainers =
            timelineGrid.querySelectorAll('[data-row-index]');
          let targetRow = 0;

          for (let i = 0; i < rowContainers.length; i++) {
            const rowRect = rowContainers[i].getBoundingClientRect();
            if (e.clientY >= rowRect.top && e.clientY <= rowRect.bottom) {
              targetRow = parseInt(
                rowContainers[i].getAttribute('data-row-index')
              );
              break;
            }
          }

          // Determine file type and compatibility
          const fileType = e.dataTransfer.items?.[0]?.type;
          let targetElementType = 'imageUrl';
          if (fileType?.startsWith('audio/')) {
            targetElementType = 'audio';
          } else if (fileType?.startsWith('video/')) {
            targetElementType = 'video';
          }

          // Check compatibility with target row
          const rowOverlays = overlays.filter(
            overlay => overlay.row === targetRow
          );
          const rowType = rowOverlays[0]?.type;
          const isIncompatible =
            rowType && !areTypesCompatible(rowType, targetElementType);

          store.updateFileGhost(newPosition, targetRow, isIncompatible);
        }
      };

      const handleGlobalDragLeave = e => {
        // Only reset if leaving the entire document
        if (!e.relatedTarget) {
          if (store.ghostState.isFileDragging) {
            store.resetGhostState();
          }
        }
      };

      const handleGlobalDrop = () => {
        if (
          store.ghostState.isFileDragging ||
          store.ghostState.isGalleryDragging
        ) {
          store.resetGhostState();
        }
      };

      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('dragover', handleGlobalDragOver);
      document.addEventListener('dragleave', handleGlobalDragLeave);
      document.addEventListener('drop', handleGlobalDrop);

      return () => {
        document.removeEventListener('mousemove', handleGlobalMouseMove);
        document.removeEventListener('dragover', handleGlobalDragOver);
        document.removeEventListener('dragleave', handleGlobalDragLeave);
        document.removeEventListener('drop', handleGlobalDrop);
      };
    }, [store, overlays]);

    // Helper: same as TimelineRow — video/audio/image never combine on same row
    const areTypesCompatible = (type1, type2) => {
      if (type1 === 'text' || type2 === 'text') return type1 === 'text' && type2 === 'text';
      if (type1 === 'animation' || type2 === 'animation') return true;
      const videoTypes = ['video'];
      const audioTypes = ['audio'];
      const imageTypes = ['imageUrl', 'image'];
      const v1 = videoTypes.includes(type1), v2 = videoTypes.includes(type2);
      const a1 = audioTypes.includes(type1), a2 = audioTypes.includes(type2);
      const i1 = imageTypes.includes(type1), i2 = imageTypes.includes(type2);
      if (v1 && (a2 || i2)) return false;
      if (v2 && (a1 || i1)) return false;
      if (a1 && (v2 || i2)) return false;
      if (a2 && (v1 || i1)) return false;
      if (i1 && (v2 || a2)) return false;
      if (i2 && (v1 || a1)) return false;
      return i1 && i2;
    };

    return (
      <div className={styles.timelineGridContainer}>
        {/* Timeline Ruler - shows time markers */}
        <TimelineRuler scale={scale} />
        
        <div
          className={styles.timelineRowContainer}
          style={{ width: `${99.95 * scale}%` }}
          ref={gridRef}
        >
        {rows.map((_, rowIndex) => {
          const rowOverlays = overlays.filter(
            overlay => overlay.row === rowIndex
          );

          return (
            <React.Fragment key={rowIndex}>
              {/* Drop zone above first row */}
              {rowIndex === 0 && (
                <div style={{ position: 'relative', height: '4px' }}>
                  <InterRowDropZone rowIndex={rowIndex} position="top" />
                </div>
              )}

              <div style={{ position: 'relative' }} data-row-index={rowIndex}>
                <TimelineRow
                  key={rowIndex}
                  rowIndex={rowIndex}
                  rowId={rowIndex}
                  overlays={rowOverlays}
                  moveElementBetweenRows={moveElementBetweenRows}
                  toggleAnimations={toggleAnimations}
                  isAnimationsVisible={isAnimationsVisible}
                  handleActiveScene={handleActiveScene}
                  storyData={storyData}
                  isCutMode={isCutMode}
                  defaultButton={defaultButton}
                  setIsCutMode={data => setIsCutMode(data)}
                  scenes={scenes}
                  onOpenTransitionPanel={onOpenTransitionPanel}
                  onOpenEffectPanel={onOpenEffectPanel}
                />

                {/* Drop zone below each row */}
                <InterRowDropZone rowIndex={rowIndex} position="bottom" />
              </div>

              {isAnimationsVisible && rowIndex === animationsPanelRow && (
                <AnimationsPanel onCloseAnimations={toggleAnimations} />
              )}
            </React.Fragment>
          );
        })}

        {/* Ghost Elements and Alignment Lines - render above all timeline rows */}
        {store.ghostState.isDragging && store.ghostState.ghostElement && (
          <TimelineGhostElement
            left={store.ghostState.ghostElement.left}
            width={store.ghostState.ghostElement.width}
            row={store.ghostState.ghostElement.row}
            elementType={store.ghostState.ghostElement.elementType}
            totalRows={store.maxRows}
            isIncompatible={store.ghostState.isIncompatibleRow}
          />
        )}

        {/* Resize Ghost */}
        {store.ghostState.isResizing && store.ghostState.resizeGhostElement && (
          <TimelineGhostElement
            left={store.ghostState.resizeGhostElement.left}
            width={store.ghostState.resizeGhostElement.width}
            row={store.ghostState.resizeGhostElement.row}
            elementType={store.ghostState.resizeGhostElement.elementType}
            totalRows={store.maxRows}
            isIncompatible={!store.ghostState.resizeGhostElement.canPush}
          />
        )}

        {/* Alignment Lines */}
        <AlignmentLines alignmentLines={store.ghostState.alignmentLines} />

        {/* Multi-ghost elements for multi-select dragging */}
        {store.ghostState.isMultiDragging &&
          store.ghostState.multiGhostElements.map(ghost => (
            <TimelineGhostElement
              key={`multi-ghost-${ghost.id}`}
              left={ghost.left}
              width={ghost.width}
              row={ghost.row}
              elementType={ghost.elementType}
              totalRows={store.maxRows}
              isIncompatible={false}
            />
          ))}

        {/* Gallery Ghost */}
        {store.ghostState.isGalleryDragging &&
          store.ghostState.galleryGhostElement && (
            <TimelineGhostElement
              left={store.ghostState.galleryGhostElement.left}
              width={store.ghostState.galleryGhostElement.width}
              row={store.ghostState.galleryGhostElement.row}
              elementType={store.ghostState.galleryGhostElement.elementType}
              totalRows={store.maxRows}
              isIncompatible={
                store.ghostState.galleryGhostElement.isIncompatible
              }
            />
          )}

        {/* File Ghost */}
        {store.ghostState.isFileDragging &&
          store.ghostState.fileGhostElement && (
            <TimelineGhostElement
              left={store.ghostState.fileGhostElement.left}
              width={store.ghostState.fileGhostElement.width}
              row={store.ghostState.fileGhostElement.row}
              elementType={store.ghostState.fileGhostElement.elementType}
              totalRows={store.maxRows}
              isIncompatible={store.ghostState.fileGhostElement.isIncompatible}
            />
          )}

        {/* Ghost Marker for hover preview */}
        <GhostMarker position={store.ghostState.ghostMarkerPosition} />
        </div>
      </div>
    );
  }
);

export default TimelineGrid;
