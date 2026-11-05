import { useEffect, useRef, useState } from "react";
import {
  Disc3,
  Music2,
  Pause,
  Play,
  Radio,
  Search,
  SkipBack,
  SkipForward,
  Volume2,
} from "lucide-react";
import "./MultimediaPanel.css";

const DEEZER_API_URL = "https://api.deezer.com";
const RADIO_API_URL = "https://all.api.radio-browser.info/json/stations/search";

function fetchDeezerJson(parameters) {
  return new Promise((resolve, reject) => {
    const callbackName = `autodashDeezer${Date.now()}${Math.floor(Math.random() * 10000)}`;
    const script = document.createElement("script");
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Deezer tardó demasiado en responder."));
    }, 15000);

    function cleanup() {
      window.clearTimeout(timeoutId);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = (result) => {
      cleanup();
      resolve(result);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error("No fue posible contactar con Deezer."));
    };
    script.src = `${DEEZER_API_URL}/${parameters}&output=jsonp&callback=${callbackName}`;
    document.body.appendChild(script);
  });
}

function formatTrackDuration(durationSeconds) {
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = String(durationSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

async function fetchRadioStations(searchTerm, signal) {
  const parameters = new URLSearchParams({
    hidebroken: "true",
    limit: "30",
    order: "clickcount",
    reverse: "true",
  });

  if (searchTerm.trim()) parameters.set("name", searchTerm.trim());

  const response = await fetch(`${RADIO_API_URL}?${parameters}`, { signal });
  if (!response.ok) throw new Error("No fue posible consultar el directorio de radio online.");

  const stations = await response.json();
  return stations.filter((station) => station.url_resolved?.startsWith("https://"));
}

export function MultimediaPanel() {
  const [mode, setMode] = useState("music");
  const [trackQuery, setTrackQuery] = useState("");
  const [tracks, setTracks] = useState([]);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [trackSearchLoading, setTrackSearchLoading] = useState(false);
  const [trackError, setTrackError] = useState("");
  const [trackNotice, setTrackNotice] = useState("");
  const [trackPlaying, setTrackPlaying] = useState(false);
  const [trackPosition, setTrackPosition] = useState(0);
  const [trackVolume, setTrackVolume] = useState(0.75);
  const trackAudioRef = useRef(null);

  const [radioQuery, setRadioQuery] = useState("");
  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState(null);
  const [radioLoading, setRadioLoading] = useState(true);
  const [radioError, setRadioError] = useState("");
  const [radioPlaying, setRadioPlaying] = useState(false);
  const [radioVolume, setRadioVolume] = useState(0.75);
  const radioAudioRef = useRef(null);
  const hlsInstanceRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchRadioStations("", controller.signal)
      .then(setStations)
      .catch((error) => {
        if (error.name !== "AbortError") setRadioError(error.message || "No se pudo cargar la radio online.");
      })
      .finally(() => setRadioLoading(false));
    return () => controller.abort();
  }, []);

  useEffect(() => () => hlsInstanceRef.current?.destroy(), []);

  useEffect(() => {
    if (trackAudioRef.current) trackAudioRef.current.volume = trackVolume;
    if (radioAudioRef.current) radioAudioRef.current.volume = radioVolume;
  }, [trackVolume, radioVolume]);

  async function searchDeezerTracks(event) {
    event.preventDefault();
    const searchTerm = trackQuery.trim();
    if (!searchTerm) return;

    setTrackSearchLoading(true);
    setTrackError("");
    setTrackNotice("");

    try {
      const result = await fetchDeezerJson(`search?q=${encodeURIComponent(searchTerm)}&limit=10`);
      if (result.error) throw new Error(result.error?.message || "No se pudo buscar en Deezer.");

      const foundTracks = result.data || [];
      setTracks(foundTracks);
      setSelectedTrack(null);
      if (!foundTracks.length) setTrackNotice("No se encontraron canciones para esa búsqueda.");
    } catch (error) {
      setTrackError(error.message || "No se pudo buscar en Deezer.");
    } finally {
      setTrackSearchLoading(false);
    }
  }

  async function playDeezerTrack(track) {
    const audioElement = trackAudioRef.current;
    if (!audioElement || !track.preview) {
      setTrackError("Esta canción no tiene una vista previa disponible.");
      return;
    }

    setSelectedTrack(track);
    setTrackError("");
    setTrackNotice("");
    setTrackPosition(0);
    audioElement.pause();
    audioElement.src = track.preview;
    audioElement.load();

    try {
      await audioElement.play();
      setTrackPlaying(true);
      setTrackNotice("");
    } catch {
      setTrackPlaying(false);
      setTrackError("No se pudo iniciar la vista previa.");
    }
  }

  function toggleTrackPlayback() {
    const audioElement = trackAudioRef.current;
    if (!audioElement || !selectedTrack?.preview) return;

    if (audioElement.paused) {
      audioElement.play()
        .then(() => setTrackPlaying(true))
        .catch(() => setTrackError("No se pudo reanudar la reproducción."));
    } else {
      audioElement.pause();
      setTrackPlaying(false);
    }
  }

  function skipTrack(direction) {
    if (!tracks.length || !selectedTrack) return;
    const currentIndex = tracks.findIndex((track) => track.id === selectedTrack.id);
    const nextIndex = direction === "next"
      ? (currentIndex + 1) % tracks.length
      : (currentIndex - 1 + tracks.length) % tracks.length;
    void playDeezerTrack(tracks[nextIndex]);
  }

  async function searchRadio(event) {
    event?.preventDefault();
    setRadioLoading(true);
    setRadioError("");
    try {
      const results = await fetchRadioStations(radioQuery, undefined);
      setStations(results);
      if (!results.length) setRadioError("No se encontraron streams HTTPS para esa búsqueda.");
    } catch (error) {
      setRadioError(error.message || "No se pudo consultar la radio online.");
    } finally {
      setRadioLoading(false);
    }
  }

  async function playStation(station) {
    const audioElement = radioAudioRef.current;
    if (!audioElement) return;

    setSelectedStation(station);
    setRadioError("");
    hlsInstanceRef.current?.destroy();
    hlsInstanceRef.current = null;
    audioElement.pause();
    audioElement.removeAttribute("src");
    audioElement.load();

    const isHlsStream = /\.m3u8(?:$|[?#])/i.test(station.url_resolved);
    const supportsNativeHls = Boolean(audioElement.canPlayType("application/vnd.apple.mpegurl"));

    if (isHlsStream && !supportsNativeHls) {
      const { default: Hls } = await import("hls.js");
      if (!Hls.isSupported()) {
        setRadioError("Este navegador no puede reproducir streams HLS.");
        return;
      }
      const hlsInstance = new Hls();
      hlsInstanceRef.current = hlsInstance;
      hlsInstance.attachMedia(audioElement);
      hlsInstance.on(Hls.Events.MEDIA_ATTACHED, () => hlsInstance.loadSource(station.url_resolved));
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        audioElement.play()
          .then(() => setRadioPlaying(true))
          .catch(() => setRadioError("El stream no pudo reproducirse. Prueba otra emisora."));
      });
      hlsInstance.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          hlsInstance.destroy();
          hlsInstanceRef.current = null;
          setRadioPlaying(false);
          setRadioError("El stream HLS de esta emisora no está disponible.");
        }
      });
      return;
    }

    audioElement.src = station.url_resolved;
    audioElement.load();
    try {
      await audioElement.play();
      setRadioPlaying(true);
    } catch {
      setRadioPlaying(false);
      setRadioError("El stream no pudo reproducirse. Prueba otra emisora.");
    }
  }

  function toggleRadioPlayback() {
    const audioElement = radioAudioRef.current;
    if (!audioElement || !selectedStation) return;
    if (audioElement.paused) {
      audioElement.play()
        .then(() => setRadioPlaying(true))
        .catch(() => setRadioError("El stream no pudo reanudarse."));
    } else {
      audioElement.pause();
      setRadioPlaying(false);
    }
  }

  return (
    <div className={`multimedia-panel ${mode === "music" ? "multimedia-music-mode" : "multimedia-radio-mode"}`}>
      <div className="media-toolbar">
        <div className="media-mode-switch" role="tablist" aria-label="Fuente multimedia">
          <button type="button" role="tab" aria-selected={mode === "music"} className={mode === "music" ? "active" : ""} onClick={() => setMode("music")}>
            <Music2 size={17} /> Música
          </button>
          <button type="button" role="tab" aria-selected={mode === "radio"} className={mode === "radio" ? "active" : ""} onClick={() => setMode("radio")}>
            <Radio size={17} /> Radio online
          </button>
        </div>
      </div>

      {mode === "music" ? (
        <div className="media-content media-music-view">
          <section className="media-column media-library">
            <div className="media-section-heading">
              <div>
                <span className="media-eyebrow">CATÁLOGO ONLINE</span>
                <h3>Buscar música</h3>
              </div>
              <span className="media-connected"><span /> Deezer</span>
            </div>
            <form className="media-search-form" onSubmit={searchDeezerTracks}>
              <Search size={18} aria-hidden="true" />
              <input aria-label="Buscar canciones en Deezer" value={trackQuery} onChange={(event) => setTrackQuery(event.target.value)} placeholder="Canción, artista o álbum" />
              <button type="submit" disabled={trackSearchLoading || !trackQuery.trim()}>{trackSearchLoading ? "Buscando" : "Buscar"}</button>
            </form>
            <div className="media-result-list" aria-live="polite">
              {tracks.map((track) => (
                <button className={`media-result-row ${selectedTrack?.id === track.id ? "selected" : ""}`} type="button" key={track.id} onClick={() => void playDeezerTrack(track)}>
                  {track.album?.cover_small ? <img src={track.album.cover_small} alt="" /> : <span className="media-result-cover"><Disc3 size={19} /></span>}
                  <span className="media-result-copy">
                    <strong>{track.title}</strong>
                    <small>{track.artist?.name} · {track.album?.title}</small>
                  </span>
                  <span className="media-result-trailing">
                    <span className="media-result-duration">{formatTrackDuration(track.duration || 0)}</span>
                    <Play className="media-row-play" size={17} fill="currentColor" />
                  </span>
                </button>
              ))}
              {!tracks.length && !trackSearchLoading && <p className="media-empty-state">Busca una canción para ver resultados.</p>}
            </div>
          </section>

          <section className="media-column media-now-playing">
            {selectedTrack ? (
              <>
                <div className="media-featured-track">
                  <div className="media-featured-artwork">
                    {selectedTrack.album?.cover_big ? <img src={selectedTrack.album.cover_big} alt={`Portada de ${selectedTrack.album.title}`} /> : <Disc3 size={52} strokeWidth={1.3} />}
                  </div>
                  <div className="media-featured-copy">
                    <span className="media-featured-label">SELECCIÓN ACTUAL</span>
                    <strong>{selectedTrack.title}</strong>
                    <span>{selectedTrack.artist?.name}</span>
                    <small>{selectedTrack.album?.title || "Deezer"} · 0:30</small>
                  </div>
                </div>
                <div className="media-sdk-controls">
                  <div className="media-track-timeline">
                    <span>{formatTrackDuration(Math.floor(trackPosition))}</span>
                    <input aria-label="Posición de reproducción" type="range" min="0" max="30" step="1" value={Math.min(trackPosition, 30)} onChange={(event) => {
                      const position = Number(event.target.value);
                      setTrackPosition(position);
                      if (trackAudioRef.current) trackAudioRef.current.currentTime = position;
                    }} />
                    <span>0:30</span>
                  </div>
                  <div className="media-transport-controls">
                    <button type="button" aria-label="Canción anterior" onClick={() => skipTrack("previous")}><SkipBack size={20} fill="currentColor" /></button>
                    <button type="button" className="media-main-play-button" aria-label={trackPlaying ? "Pausar" : "Reproducir"} onClick={toggleTrackPlayback}>
                      {trackPlaying ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" />}
                    </button>
                    <button type="button" aria-label="Siguiente canción" onClick={() => skipTrack("next")}><SkipForward size={20} fill="currentColor" /></button>
                  </div>
                  <label className="media-volume-control">
                    <Volume2 size={17} />
                    <input aria-label="Volumen de Deezer" type="range" min="0" max="1" step="0.01" value={trackVolume} onChange={(event) => setTrackVolume(Number(event.target.value))} />
                  </label>
                </div>
              </>
            ) : (
              <div className="media-player-placeholder">
                <div className="media-placeholder-disc"><Disc3 size={54} strokeWidth={1.2} /></div>
                <strong>Tu música, a tu manera</strong>
                <span>Busca una canción en Deezer para reproducir su vista previa.</span>
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="media-content media-radio-view">
          <section className="media-column media-radio-library">
            <div className="media-section-heading">
              <div><span className="media-eyebrow">DIRECTORIO DE INTERNET</span><h3>Emisoras</h3></div>
              <span className="media-live-badge"><span /> EN LÍNEA</span>
            </div>
            <form className="media-search-form" onSubmit={searchRadio}>
              <Search size={18} aria-hidden="true" />
              <input aria-label="Buscar emisoras por nombre" value={radioQuery} onChange={(event) => setRadioQuery(event.target.value)} placeholder="Emisora, ciudad o género" />
              <button type="submit" disabled={radioLoading}>{radioLoading ? "Buscando" : "Buscar"}</button>
            </form>
            <div className="media-result-list radio-result-list" aria-live="polite">
              {stations.map((station) => (
                <button className={`media-result-row ${selectedStation?.stationuuid === station.stationuuid ? "selected" : ""}`} type="button" key={station.stationuuid} onClick={() => void playStation(station)}>
                  {station.favicon ? <img src={station.favicon} alt="" /> : <span className="media-result-cover"><Radio size={19} /></span>}
                  <span className="media-result-copy">
                    <strong>{station.name}</strong>
                    <small>{[station.country, station.codec, station.bitrate ? `${station.bitrate} kbps` : ""].filter(Boolean).join(" · ")}</small>
                  </span>
                  <Play className="media-row-play" size={17} fill="currentColor" />
                </button>
              ))}
            </div>
          </section>
          <section className="media-column media-radio-player">
            <div className="media-section-heading">
              <div><span className="media-eyebrow">RADIO ONLINE</span><h3>{selectedStation?.name || "Elige una emisora"}</h3></div>
              <Radio size={20} />
            </div>
            <div className="radio-now-playing">
              <div className="radio-artwork"><Radio size={38} strokeWidth={1.5} /></div>
              <div className="radio-station-name"><strong>{selectedStation?.name || "AutoDash Radio"}</strong><span>{selectedStation?.country || "Streams disponibles en internet"}</span></div>
              <div className="radio-playback-controls">
                <button className="radio-play-button" type="button" aria-label={radioPlaying ? "Pausar radio" : "Reanudar radio"} disabled={!selectedStation} onClick={toggleRadioPlayback}>
                  {radioPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                </button>
                <span>{radioPlaying ? "EN VIVO" : "STREAM"}</span>
              </div>
            </div>
            <div className="radio-audio-settings">
              <label htmlFor="radio-volume"><Volume2 size={17} /> Volumen</label>
              <input id="radio-volume" type="range" min="0" max="1" step="0.01" value={radioVolume} onChange={(event) => setRadioVolume(Number(event.target.value))} />
            </div>
          </section>
        </div>
      )}

      {trackError && mode === "music" && <p className="media-message error" role="alert">{trackError}</p>}
      {trackNotice && mode === "music" && <p className="media-message" role="status">{trackNotice}</p>}
      {radioError && mode === "radio" && <p className="media-message error" role="alert">{radioError}</p>}

      <audio
        ref={trackAudioRef}
        className="media-audio-element"
        onTimeUpdate={(event) => setTrackPosition(event.currentTarget.currentTime)}
        onPause={() => setTrackPlaying(false)}
        onPlay={() => setTrackPlaying(true)}
        onEnded={() => {
          setTrackPlaying(false);
          setTrackPosition(30);
        }}
        onError={() => {
          setTrackPlaying(false);
          setTrackError("La vista previa de Deezer no está disponible.");
        }}
      />
      <audio ref={radioAudioRef} className="media-audio-element" onPause={() => setRadioPlaying(false)} onPlay={() => setRadioPlaying(true)} />
    </div>
  );
}
