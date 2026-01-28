import React from 'react';
import { observer } from 'mobx-react';
import styles from './Timeline.module.scss';

const AlignmentLines = observer(({ alignmentLines }) => {
  if (!alignmentLines || alignmentLines.length === 0) {
    return null;
  }

  return (
    <>
      {alignmentLines.map((line, index) => (
        <div
          key={`alignment-${index}-${line.position}`}
          className={`${styles.alignmentLine} ${line.snapGuide ? styles.snapGuide : ''} ${styles[line.type] || ''}`}
          style={{
            left: `${line.position}%`,
          }}
          title={line.type ? `Snap: ${line.type.replace('-', ' to ')}` : 'Alignment guide'}
        />
      ))}
    </>
  );
});

export default AlignmentLines;
