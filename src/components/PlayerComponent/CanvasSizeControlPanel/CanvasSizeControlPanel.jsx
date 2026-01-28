import React, { useState, useRef, useEffect } from 'react';
import { observer } from 'mobx-react';
import { StoreContext } from '../../../mobx';
import { ButtonWithIcon } from 'components/reusableComponents/ButtonWithIcon';
import ReusablePopup from '../ReusablePopup';
import toast from 'react-hot-toast';
import styles from './CanvasSizeControlPanel.module.scss';

/**
 * CanvasSizeControlPanel - Professional canvas size and aspect ratio control panel
 * Allows users to manually adjust canvas dimensions and aspect ratio
 */
const CanvasSizeControlPanel = observer(() => {
  const store = React.useContext(StoreContext);
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [isResizingCanvas, setIsResizingCanvas] = useState(false);
  const menuRef = useRef(null);
  const timeoutRef = useRef(null);

  // Common aspect ratios
  const aspectRatioOptions = [
    { label: '9:16', width: 9, height: 16, name: 'Portrait (TikTok)' },
    { label: '16:9', width: 16, height: 9, name: 'Landscape (YouTube)' },
    { label: '1:1', width: 1, height: 1, name: 'Square (Instagram)' },
    { label: '4:3', width: 4, height: 3, name: 'Classic' },
    { label: '3:4', width: 3, height: 4, name: 'Portrait Classic' },
    { label: '21:9', width: 21, height: 9, name: 'Ultrawide' },
  ];

  // Custom size options
  const customSizeOptions = [
    { label: '1080x1920', width: 1080, height: 1920, name: 'Full HD Portrait' },
    { label: '1920x1080', width: 1920, height: 1080, name: 'Full HD Landscape' },
    { label: '720x1280', width: 720, height: 1280, name: 'HD Portrait' },
    { label: '1280x720', width: 1280, height: 720, name: 'HD Landscape' },
  ];

  const currentAspectRatio = store?.currentAspectRatio || { width: 9, height: 16 };
  const currentRatioLabel = `${currentAspectRatio.width}:${currentAspectRatio.height}`;

  const handleAspectRatioChange = (ratio) => {
    if (store && store.updateAspectRatio) {
      store.updateAspectRatio({ width: ratio.width, height: ratio.height });
      setIsMenuVisible(false);
      toast.success(`Canvas set to ${ratio.name || ratio.label}`);
    }
  };

  const handleCustomSizeChange = (size) => {
    if (store && store.canvas) {
      // Calculate aspect ratio from custom size
      const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
      const divisor = gcd(size.width, size.height);
      const aspectWidth = size.width / divisor;
      const aspectHeight = size.height / divisor;

      store.updateAspectRatio({ width: aspectWidth, height: aspectHeight });
      setIsMenuVisible(false);
      toast.success(`Canvas set to ${size.name || size.label}`);
    }
  };

  // Combine aspect ratio and custom size options
  const menuOptions = [
    ...aspectRatioOptions.map(ratio => ({
      id: `ratio-${ratio.width}-${ratio.height}`,
      name: `${ratio.label} - ${ratio.name}`,
      onClick: () => handleAspectRatioChange(ratio),
    })),
    { id: 'divider', name: '---', isDivider: true },
    ...customSizeOptions.map(size => ({
      id: `size-${size.width}-${size.height}`,
      name: `${size.label} - ${size.name}`,
      onClick: () => handleCustomSizeChange(size),
    })),
  ];

  return (
    <div className={styles.canvasSizeControl}>
      <div className={styles.settingsContainer}>
        <ButtonWithIcon
          icon="AspectRatioIcon"
          size="16"
          color={isMenuVisible ? 'white' : '#FFFFFF66'}
          classNameButton={styles.canvasSizeButton}
          tooltipText={`Canvas: ${currentRatioLabel}`}
          tooltipPlace="left"
          onMouseEnter={() => {
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
            }
            timeoutRef.current = setTimeout(() => {
              setIsMenuVisible(true);
            }, 200);
          }}
          onMouseLeave={() => {
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
              timeoutRef.current = null;
            }
            setTimeout(() => {
              const menuElement = menuRef.current;
              if (menuElement && menuElement.matches(':hover')) {
                return;
              }
              setIsMenuVisible(false);
            }, 200);
          }}
        />
        {isMenuVisible && (
          <ReusablePopup
            ref={menuRef}
            menuOptions={menuOptions}
            onClickMethod={(option) => {
              if (option.onClick) option.onClick();
            }}
            onMouseEnter={() => setIsMenuVisible(true)}
            onMouseLeave={() => setIsMenuVisible(false)}
            className={styles.canvasSizeMenu}
            minWidth="200px"
          />
        )}
      </div>
      <div className={styles.currentSizeDisplay}>
        {currentRatioLabel}
      </div>
    </div>
  );
});

export default CanvasSizeControlPanel;
