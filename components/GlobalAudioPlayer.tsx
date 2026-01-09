import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
// Import the music file directly from src
// @ts-ignore
import bgMusic from '../music/PRAGMATA.mp3';

export function GlobalAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const hasInteractedRef = useRef(false);
  const playAttemptedRef = useRef(false);

  const playAudio = useCallback(async () => {
    if (!audioRef.current) return;
    
    try {
      // 確保音量設定
      audioRef.current.volume = 0.3;
      
      // 如果已經在播放，不要重複播放
      if (!audioRef.current.paused) {
        setIsPlaying(true);
        return;
      }
      
      // 嘗試播放
      await audioRef.current.play();
      setIsPlaying(true);
      playAttemptedRef.current = true;
    } catch (err) {
      // console.log("Autoplay blocked, waiting for interaction");
      setIsPlaying(false);
      // 即使失敗也標記為已嘗試，這樣互動後會重試
      playAttemptedRef.current = true;
    }
  }, []);

  // 初始化：嘗試立即播放
  useEffect(() => {
    // 延遲一點點確保 audio 元素已經掛載
    const timer = setTimeout(() => {
      playAudio();
    }, 100);

    return () => clearTimeout(timer);
  }, [playAudio]);

  // 設置互動監聽器（只設置一次）
  useEffect(() => {
    const handleInteraction = async () => {
      if (!hasInteractedRef.current) {
        hasInteractedRef.current = true;
        // 互動後立即嘗試播放
        await playAudio();
      }
    };

    // 監聽多種互動事件
    const events = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'];
    
    events.forEach(event => {
      window.addEventListener(event, handleInteraction, { passive: true });
    });
    
    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleInteraction);
      });
    };
  }, [playAudio]);

  // 監聽音訊播放狀態變化
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      // 如果音樂結束（不應該發生因為有 loop），重新播放
      if (hasInteractedRef.current) {
        playAudio();
      }
    };
    const handleError = (e: Event) => {
      console.error('Audio error:', e);
      setIsPlaying(false);
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [playAudio]);

  // 定期檢查並恢復播放（防止音樂意外停止）
  useEffect(() => {
    const checkInterval = setInterval(() => {
      const audio = audioRef.current;
      if (audio && hasInteractedRef.current && audio.paused && !isMuted) {
        // 如果應該在播放但實際暫停了，嘗試恢復
        playAudio();
      }
    }, 2000); // 每2秒檢查一次

    return () => clearInterval(checkInterval);
  }, [isMuted, playAudio]);

  const toggleMute = () => {
    if (audioRef.current) {
      const newMutedState = !isMuted;
      audioRef.current.muted = newMutedState;
      setIsMuted(newMutedState);
      
      // 如果取消靜音且應該在播放，確保播放
      if (!newMutedState && hasInteractedRef.current && audioRef.current.paused) {
        playAudio();
      }
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex items-center gap-2">
      <audio 
        ref={audioRef} 
        src={bgMusic} 
        loop 
        preload="auto"
        autoPlay
      />
      
      {/* Mute Toggle */}
      <button 
        onClick={toggleMute}
        className="p-2 border border-ghost/30 bg-void/80 text-gray-400 hover:text-signal hover:border-signal transition-all rounded-full backdrop-blur-sm group"
      >
        {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} className={isPlaying ? "animate-pulse" : ""} />}
      </button>
      
      {/* Visualizer */}
      {isPlaying && !isMuted && (
          <div className="flex gap-1 h-3 items-end">
              <div className="w-1 bg-signal animate-[pulse_1s_ease-in-out_infinite] h-full"></div>
              <div className="w-1 bg-signal animate-[pulse_1.5s_ease-in-out_infinite] h-2/3"></div>
              <div className="w-1 bg-signal animate-[pulse_0.8s_ease-in-out_infinite] h-1/2"></div>
          </div>
      )}
    </div>
  );
}
