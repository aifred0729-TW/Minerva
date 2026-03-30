import React, { useState } from 'react';
import { BaseEdge, EdgeProps, getStraightPath, EdgeLabelRenderer } from '@xyflow/react';

export const PulseEdge = ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    markerEnd,
    data,
    label
  }: EdgeProps) => {
    const [edgePath, labelX, labelY] = getStraightPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
    });
  
    // Use timestamp as key to trigger animation restart
    const timestamp = data?.timestamp;
    // C2 profile icon loading
    const [c2ImgLoaded, setC2ImgLoaded] = useState(false);
    const [c2ImgError, setC2ImgError] = useState(false);
    const c2IconName = String(label || '').split(',')[0].trim();
    const c2IconUrl = (c2IconName && c2IconName !== 'Linked' && c2IconName !== 'Custom' && c2IconName !== '')
        ? `/direct/download/${c2IconName}/icon.svg` : null;
  
    return (
      <>
        <BaseEdge path={edgePath} style={style} />
        {/* Edge Label via HTML overlay for icon + text */}
        {label && (
          <EdgeLabelRenderer>
            <div
              style={{
                position: 'absolute',
                transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                pointerEvents: 'none',
                zIndex: 10,
              }}
              className="flex items-center gap-1 px-1.5 py-0.5 bg-white/95 border border-black/20 text-gray-800 text-[10px] font-semibold font-mono whitespace-nowrap rounded-sm"
            >
              {c2IconUrl && !c2ImgError && (
                <img
                  src={c2IconUrl}
                  onLoad={() => setC2ImgLoaded(true)}
                  onError={() => setC2ImgError(true)}
                  style={{ width: 11, height: 11, objectFit: 'contain', opacity: c2ImgLoaded ? 1 : 0 }}
                  alt=""
                />
              )}
              {String(label)}
            </div>
          </EdgeLabelRenderer>
        )}
        {data?.active && (
          <g>
             <circle r="4" fill="#ffffff" filter="url(#glow-pulse)" opacity="0">
                <animateMotion 
                    key={String(timestamp || '')}
                    dur="1.5s" 
                    repeatCount="1" 
                    path={edgePath} 
                    keyPoints="1;0"
                    keyTimes="0;1"
                    calcMode="linear"
                    fill="remove"
                />
                <animate 
                    key={`${timestamp}-opacity`}
                    attributeName="opacity" 
                    values="1;1" 
                    dur="1.5s" 
                    repeatCount="1" 
                    fill="remove"
                />
             </circle>
          </g>
        )}
      </>
    );
  };

// Group bound container node for groupBy visual clustering

export const C2LabelEdge = ({ id, sourceX, sourceY, targetX, targetY, style, data, label }: EdgeProps) => {
    const [edgePath, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
    const [imgLoaded, setImgLoaded] = useState(false);
    const [imgError, setImgError] = useState(false);
    const profileName = String(label || '').split(',')[0].trim();
    const iconUrl = (profileName && profileName !== 'Linked' && profileName !== 'Custom' && profileName !== '')
        ? `/direct/download/${profileName}/icon.svg` : null;
    return (
        <>
            <BaseEdge id={id} path={edgePath} style={style} />
            {label && (
                <EdgeLabelRenderer>
                    <div
                        style={{
                            position: 'absolute',
                            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                            pointerEvents: 'none',
                        }}
                        className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-sm text-[10px] font-mono bg-black/80 border border-white/15 text-gray-400 whitespace-nowrap"
                    >
                        {iconUrl && !imgError && (
                            <img
                                src={iconUrl}
                                onLoad={() => setImgLoaded(true)}
                                onError={() => setImgError(true)}
                                style={{ width: 11, height: 11, objectFit: 'contain', opacity: imgLoaded ? 1 : 0 }}
                                alt=""
                            />
                        )}
                        {String(label)}
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    );
};

// BsCallbackNode — lightweight callback node used in the BrowserScript graph view
