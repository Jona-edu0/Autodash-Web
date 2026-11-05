import { useEffect, useRef, useState } from "react";
import {
  Disc3,
  Headphones,
  LogOut,
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

const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_URL = "https://api.spotify.com/v1";
const SPOTIFY_PLAYBACK_SDK_ID = "autodash-spotify-playback-sdk";
const SPOTIFY_PLAYBACK_SDK_URL = "https://sdk.scdn.co/spotify-player.js";
const DEFAULT_SPOTIFY_CLIENT_ID = "1ae21a487c75482c82ab57f3a0fc110f";
const SPOTIFY_SCOPES = "user-read-private user-read-email streaming user-read-playback-state user-modify-playback-state";
const RADIO_API_URL = "https://all.api.radio-browser.info/json/stations/search";
const SPOTIFY_SESSION_KEY = "autodash-spotify-session-v2";
const SPOTIFY_VERIFIER_KEY = "autodash-spotify-verifier";
const SPOTIFY_STATE_KEY = "autodash-spotify-state";

function randomString(length) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const randomValues = crypto.getRandomValues(new Uint8Array(length));

  return Array.from(randomValues, (value) => alphabet[value % alphabet.length]).join("");
}

function encodeBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function createCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);

  return encodeBase64Url(digest);
}

function readSpotifySession() {
  try {
    const storedSession = sessionStorage.getItem(SPOTIFY_SESSION_KEY);
    return storedSession ? JSON.parse(storedSession) : null;
  } catch {
    return null;
  }
}

function getSpotifyRedirectUri(location = window.location) {
  const isHttpsLocalhost = location.protocol === "https:"
    && ["localhost", "127.0.0.1", "::1"].includes(location.hostname);

  return isHttpsLocalhost
    ? `http://127.0.0.1:5174${location.pathname}`
    : `${location.origin}${location.pathname}`;
}

function formatTrackDuration(durationMs) {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");

  return `${minutes}:${seconds}`;
}

async function fetchRadioStations(searchTerm, signal) {
  const parameters = new URLSearchParams({
    hidebroken: "true",
    limit: "30",
    order: "clickcount",
    reverse: "true",
  });

  if (searchTerm.trim()) {
    parameters.set("name", searchTerm.trim());
  }

  const response = await fetch(`${RADIO_API_URL}?${parameters}`, { signal });

  if (!response.ok) {
    throw new Error("No fue posible consultar el directorio de radio online.");
  }

  const stations = await response.json();
  return stations.filter((station) => station.url_resolved?.startsWith("https://"));
}

export function MultimediaPanel() {
  const [mode, setMode] = useState("music");
  const isSpotifyHttpsLocalhost = window.location.protocol === "https:"
    && ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  const spotifyRedirectUri = getSpotifyRedirectUri();
  const [clientId, setClientId] = useState(
    () => import.meta.env.VITE_SPOTIFY_CLIENT_ID || localStorage.getItem("autodash-spotify-client-id") || DEFAULT_SPOTIFY_CLIENT_ID
  );
  const [clientIdDraft, setClientIdDraft] = useState(clientId);
  const [showClientIdForm, setShowClientIdForm] = useState(!clientId);
  const [spotifySession, setSpotifySession] = useState(readSpotifySession);
  const hasSpotifySession = Boolean(spotifySession);
  const [spotifyError, setSpotifyError] = useState("");
  const [spotifyNotice, setSpotifyNotice] = useState("");
  const [spotifyPlayerStatus, setSpotifyPlayerStatus] = useState("disconnected");
  const [spotifyPlayerError, setSpotifyPlayerError] = useState("");
  const [spotifyDeviceId, setSpotifyDeviceId] = useState("");
  const [currentPlaybackTrack, setCurrentPlaybackTrack] = useState(null);
  const [isSpotifyPlaying, setIsSpotifyPlaying] = useState(false);
  const [spotifyPlaybackPosition, setSpotifyPlaybackPosition] = useState(0);
  const [spotifyPlaybackDuration, setSpotifyPlaybackDuration] = useState(0);
  const [spotifyPlayerVolume, setSpotifyPlayerVolume] = useState(0.7);
  const [trackQuery, setTrackQuery] = useState("");
  const [tracks, setTracks] = useState([]);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [trackSearchLoading, setTrackSearchLoading] = useState(false);
  const [radioQuery, setRadioQuery] = useState("");
  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState(null);
  const [radioLoading, setRadioLoading] = useState(true);
  const [radioError, setRadioError] = useState("");
  const [radioPlaying, setRadioPlaying] = useState(false);
  const [radioVolume, setRadioVolume] = useState(0.75);
  const radioAudioRef = useRef(null);
  const hlsInstanceRef = useRef(null);
  const spotifyPlayerRef = useRef(null);
  const spotifyAccessTokenProviderRef = useRef(null);

  useEffect(() => {
    spotifyAccessTokenProviderRef.current = getSpotifyAccessToken;
  });

  useEffect(() => {
    const controller = new AbortController();

    fetchRadioStations("", controller.signal)
      .then(setStations)
      .catch((error) => {
        if (error.name !== "AbortError") {
          setRadioError(error.message || "No se pudo cargar la radio online.");
        }
      })
      .finally(() => setRadioLoading(false));

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const callbackUrl = new URL(window.location.href);
    const authorizationCode = callbackUrl.searchParams.get("code");
    const authorizationError = callbackUrl.searchParams.get("error");

    if (!authorizationCode && !authorizationError) {
      return undefined;
    }

    const cleanUrl = `${window.location.pathname}${window.location.hash}`;
    window.history.replaceState({}, document.title, cleanUrl);

    let isCancelled = false;

    async function finishSpotifyAuthorization() {
      if (authorizationError) {
        setSpotifyError("No se autorizó el acceso a Spotify.");
        return;
      }

      const expectedState = sessionStorage.getItem(SPOTIFY_STATE_KEY);
      const returnedState = callbackUrl.searchParams.get("state");
      const verifier = sessionStorage.getItem(SPOTIFY_VERIFIER_KEY);

      if (!clientId || !verifier || !expectedState || returnedState !== expectedState) {
        setSpotifyError("No se pudo validar la conexión con Spotify. Vuelve a conectarlo.");
        return;
      }

      try {
        const response = await fetch(SPOTIFY_TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            code: authorizationCode,
            code_verifier: verifier,
            grant_type: "authorization_code",
            redirect_uri: getSpotifyRedirectUri(callbackUrl),
          }),
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error_description || "Spotify rechazó la conexión.");
        }

        const nextSession = {
          accessToken: result.access_token,
          refreshToken: result.refresh_token,
          expiresAt: Date.now() + result.expires_in * 1000,
          scopeVersion: 2,
        };

        sessionStorage.setItem(SPOTIFY_SESSION_KEY, JSON.stringify(nextSession));
        sessionStorage.removeItem(SPOTIFY_VERIFIER_KEY);
        sessionStorage.removeItem(SPOTIFY_STATE_KEY);

        if (!isCancelled) {
          setSpotifySession(nextSession);
          setSpotifyError("");
          setSpotifyNotice("Spotify está conectado.");
        }
      } catch (error) {
        if (!isCancelled) {
          setSpotifyError(error.message || "No se pudo completar la conexión con Spotify.");
        }
      }
    }

    void finishSpotifyAuthorization();

    return () => {
      isCancelled = true;
    };
  }, [clientId]);

  useEffect(() => {
    if (!hasSpotifySession) {
      return undefined;
    }

    let isCancelled = false;
    let player = null;

    function initializeSpotifyPlayer() {
      if (isCancelled || !window.Spotify?.Player) {
        return;
      }

      player = new window.Spotify.Player({
        name: "AutoDash Web",
        getOAuthToken: (callback) => {
          const getAccessToken = spotifyAccessTokenProviderRef.current;

          if (!getAccessToken) {
            setSpotifyPlayerError("Conecta Spotify para iniciar el reproductor.");
            return;
          }

          getAccessToken()
            .then(callback)
            .catch((error) => {
              setSpotifyPlayerStatus("error");
              setSpotifyPlayerError(error.message || "No se pudo renovar la sesión de Spotify.");
            });
        },
        volume: 0.7,
      });
      spotifyPlayerRef.current = player;
      setSpotifyPlayerStatus("connecting");
      setSpotifyPlayerError("");

      player.addListener("ready", ({ device_id }) => {
        if (isCancelled) return;
        setSpotifyDeviceId(device_id);
        setSpotifyPlayerStatus("ready");
        setSpotifyPlayerError("");
      });
      player.addListener("not_ready", () => {
        if (isCancelled) return;
        setSpotifyDeviceId("");
        setSpotifyPlayerStatus("offline");
      });
      player.addListener("player_state_changed", (state) => {
        if (isCancelled || !state) return;
        setCurrentPlaybackTrack(state.track_window.current_track || null);
        setIsSpotifyPlaying(!state.paused);
        setSpotifyPlaybackPosition(state.position);
        setSpotifyPlaybackDuration(state.duration);
      });
      player.addListener("initialization_error", ({ message }) => {
        setSpotifyPlayerStatus("error");
        setSpotifyPlayerError(message || "El navegador no pudo iniciar el reproductor Spotify.");
      });
      player.addListener("authentication_error", ({ message }) => {
        setSpotifyPlayerStatus("error");
        setSpotifyPlayerError(message || "Vuelve a conectar Spotify para renovar los permisos.");
      });
      player.addListener("account_error", ({ message }) => {
        setSpotifyPlayerStatus("error");
        setSpotifyPlayerError(message || "Spotify Connect en el navegador requiere una cuenta Premium.");
      });
      player.addListener("playback_error", ({ message }) => {
        setSpotifyPlayerError(message || "Spotify no pudo reproducir esta canción.");
      });
      player.addListener("autoplay_failed", () => {
        setSpotifyPlayerError("Pulsa Activar audio para permitir que el navegador reciba la reproducción.");
      });

      player.connect().then((connected) => {
        if (!isCancelled && !connected) {
          setSpotifyPlayerStatus("error");
          setSpotifyPlayerError("Spotify no pudo conectar AutoDash Web como dispositivo.");
        }
      });
    }

    window.onSpotifyWebPlaybackSDKReady = initializeSpotifyPlayer;

    if (window.Spotify?.Player) {
      initializeSpotifyPlayer();
    } else if (!document.getElementById(SPOTIFY_PLAYBACK_SDK_ID)) {
      const script = document.createElement("script");
      script.id = SPOTIFY_PLAYBACK_SDK_ID;
      script.src = SPOTIFY_PLAYBACK_SDK_URL;
      script.async = true;
      script.onerror = () => {
        if (!isCancelled) {
          setSpotifyPlayerStatus("error");
          setSpotifyPlayerError("No se pudo cargar el Web Playback SDK de Spotify.");
        }
      };
      document.body.appendChild(script);
    }

    return () => {
      isCancelled = true;
      if (window.onSpotifyWebPlaybackSDKReady === initializeSpotifyPlayer) {
        window.onSpotifyWebPlaybackSDKReady = undefined;
      }
      player?.disconnect();
      if (spotifyPlayerRef.current === player) {
        spotifyPlayerRef.current = null;
      }
    };
  }, [hasSpotifySession]);

  useEffect(() => {
    if (radioAudioRef.current) {
      radioAudioRef.current.volume = radioVolume;
    }
  }, [radioVolume]);

  useEffect(() => () => hlsInstanceRef.current?.destroy(), []);

  function saveSpotifyClientId(event) {
    event.preventDefault();
    const normalizedClientId = clientIdDraft.trim();

    if (!normalizedClientId) {
      setSpotifyError("Escribe el Client ID de tu aplicación de Spotify.");
      return;
    }

    localStorage.setItem("autodash-spotify-client-id", normalizedClientId);
    setClientId(normalizedClientId);
    setShowClientIdForm(false);
    setSpotifyError("");
    setSpotifyNotice("Client ID guardado en este navegador.");
  }

  async function connectSpotify() {
    if (!clientId) {
      setShowClientIdForm(true);
      setSpotifyError("Configura primero el Client ID de Spotify.");
      return;
    }

    if (isSpotifyHttpsLocalhost) {
      setSpotifyError("Spotify rechaza https://localhost. Ejecuta npm run dev:spotify y abre la URL indicada abajo.");
      return;
    }

    try {
      const verifier = randomString(64);
      const challenge = await createCodeChallenge(verifier);
      const requestState = randomString(32);
      const redirectUri = getSpotifyRedirectUri();
      const authorizationUrl = new URL(SPOTIFY_AUTH_URL);

      sessionStorage.setItem(SPOTIFY_VERIFIER_KEY, verifier);
      sessionStorage.setItem(SPOTIFY_STATE_KEY, requestState);

      authorizationUrl.search = new URLSearchParams({
        client_id: clientId,
        code_challenge: challenge,
        code_challenge_method: "S256",
        redirect_uri: redirectUri,
        response_type: "code",
        scope: SPOTIFY_SCOPES,
        state: requestState,
      });

      window.location.assign(authorizationUrl.toString());
    } catch (error) {
      setSpotifyError(error.message || "No se pudo iniciar la autorización de Spotify.");
    }
  }

  async function getSpotifyAccessToken() {
    let currentSession = spotifySession || readSpotifySession();

    if (!currentSession) {
      throw new Error("Conecta Spotify para buscar canciones.");
    }

    if (currentSession.expiresAt > Date.now() + 30000) {
      return currentSession.accessToken;
    }

    if (!currentSession.refreshToken) {
      throw new Error("La sesión de Spotify venció. Vuelve a conectarte.");
    }

    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: "refresh_token",
        refresh_token: currentSession.refreshToken,
      }),
    });
    const result = await response.json();

    if (!response.ok) {
      sessionStorage.removeItem(SPOTIFY_SESSION_KEY);
      setSpotifySession(null);
      throw new Error("La sesión de Spotify venció. Vuelve a conectarte.");
    }

    currentSession = {
      accessToken: result.access_token,
      refreshToken: result.refresh_token || currentSession.refreshToken,
      expiresAt: Date.now() + result.expires_in * 1000,
    };
    sessionStorage.setItem(SPOTIFY_SESSION_KEY, JSON.stringify(currentSession));
    setSpotifySession(currentSession);

    return currentSession.accessToken;
  }

  async function searchSpotifyTracks(event) {
    event.preventDefault();
    const searchTerm = trackQuery.trim();

    if (!searchTerm) {
      return;
    }

    setTrackSearchLoading(true);
    setSpotifyError("");
    setSpotifyNotice("");

    try {
      const accessToken = await getSpotifyAccessToken();
      const parameters = new URLSearchParams({
        limit: "10",
        market: "MX",
        q: searchTerm,
        type: "track",
      });
      const response = await fetch(`${SPOTIFY_API_URL}/search?${parameters}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || "No se pudo buscar en Spotify.");
      }

      setTracks(result.tracks?.items || []);
      setSelectedTrack(null);

      if (!result.tracks?.items?.length) {
        setSpotifyNotice("No se encontraron canciones para esa búsqueda.");
      }
    } catch (error) {
      setSpotifyError(error.message || "No se pudo buscar en Spotify.");
    } finally {
      setTrackSearchLoading(false);
    }
  }

  async function playSpotifyTrack(track) {
    setSelectedTrack(track);
    setSpotifyError("");
    setSpotifyNotice("");

    if (!spotifyPlayerRef.current || !spotifyDeviceId) {
      setSpotifyNotice("AutoDash Web se está conectando. Espera a que aparezca como dispositivo disponible y vuelve a elegir la canción.");
      return;
    }

    try {
      await spotifyPlayerRef.current.activateElement();
      const accessToken = await getSpotifyAccessToken();
      const response = await fetch(
        `${SPOTIFY_API_URL}/me/player/play?device_id=${encodeURIComponent(spotifyDeviceId)}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ uris: [track.uri] }),
        }
      );

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        if (response.status === 403) {
          throw new Error("Spotify requiere una cuenta Premium para reproducir en AutoDash Web.");
        }
        if (response.status === 404) {
          throw new Error("AutoDash Web aún no aparece como dispositivo activo. Espera y vuelve a intentarlo.");
        }
        throw new Error(result.error?.message || "Spotify no pudo iniciar esta canción.");
      }

      setSpotifyNotice("Reproduciendo en AutoDash Web.");
    } catch (error) {
      setSpotifyError(error.message || "No se pudo iniciar la reproducción en AutoDash Web.");
    }
  }

  async function activateSpotifyAudio() {
    if (!spotifyPlayerRef.current) {
      setSpotifyPlayerError("El reproductor de Spotify todavía está iniciando.");
      return;
    }

    try {
      await spotifyPlayerRef.current.activateElement();
      setSpotifyPlayerError("");
    } catch {
      setSpotifyPlayerError("No se pudo activar el audio en este navegador.");
    }
  }

  async function toggleSpotifyPlayback() {
    if (!spotifyPlayerRef.current) return;

    try {
      await spotifyPlayerRef.current.activateElement();
      await spotifyPlayerRef.current.togglePlay();
    } catch {
      setSpotifyPlayerError("No se pudo cambiar el estado de reproducción.");
    }
  }

  function skipSpotifyTrack(direction) {
    const player = spotifyPlayerRef.current;
    if (!player) return;

    const action = direction === "next" ? player.nextTrack() : player.previousTrack();
    action.catch(() => setSpotifyPlayerError("Spotify no pudo cambiar de canción."));
  }

  function updateSpotifyVolume(event) {
    const nextVolume = Number(event.target.value);
    setSpotifyPlayerVolume(nextVolume);
    spotifyPlayerRef.current?.setVolume(nextVolume)
      .catch(() => setSpotifyPlayerError("No se pudo cambiar el volumen del reproductor."));
  }

  function seekSpotifyTrack(event) {
    if (!spotifyPlayerRef.current) return;
    spotifyPlayerRef.current.seek(Number(event.currentTarget.value))
      .catch(() => setSpotifyPlayerError("No se pudo cambiar la posición de la canción."));
  }

  const displayedTrack = currentPlaybackTrack || selectedTrack;

  function disconnectSpotify() {
    sessionStorage.removeItem(SPOTIFY_SESSION_KEY);
    sessionStorage.removeItem(SPOTIFY_VERIFIER_KEY);
    sessionStorage.removeItem(SPOTIFY_STATE_KEY);
    setSpotifySession(null);
    setTracks([]);
    setSelectedTrack(null);
    setSpotifyNotice("Sesión de Spotify cerrada.");
    setSpotifyError("");
    setSpotifyPlayerStatus("disconnected");
    setSpotifyDeviceId("");
    setCurrentPlaybackTrack(null);
    setIsSpotifyPlaying(false);
  }

  async function searchRadio(event) {
    event?.preventDefault();
    setRadioLoading(true);
    setRadioError("");

    try {
      const results = await fetchRadioStations(radioQuery, undefined);
      setStations(results);

      if (results.length === 0) {
        setRadioError("No se encontraron streams HTTPS para esa búsqueda.");
      }
    } catch (error) {
      setRadioError(error.message || "No se pudo consultar la radio online.");
    } finally {
      setRadioLoading(false);
    }
  }

  async function playStation(station) {
    const audioElement = radioAudioRef.current;

    if (!audioElement) {
      return;
    }

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
          .catch(() => {
            setRadioPlaying(false);
            setRadioError("El stream no pudo reproducirse. Prueba otra emisora.");
          });
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

    if (!audioElement || !selectedStation) {
      return;
    }

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
          <button
            type="button"
            role="tab"
            aria-selected={mode === "music"}
            className={mode === "music" ? "active" : ""}
            onClick={() => setMode("music")}
          >
            <Music2 size={17} /> Música
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "radio"}
            className={mode === "radio" ? "active" : ""}
            onClick={() => setMode("radio")}
          >
            <Radio size={17} /> Radio online
          </button>
        </div>
        {mode === "music" && spotifySession && (
          <button className="media-quiet-button" type="button" onClick={disconnectSpotify}>
            <LogOut size={16} /> Desconectar Spotify
          </button>
        )}
      </div>

      {mode === "music" ? (
        <div className="media-content media-music-view">
          <section className="media-column media-library">
            <div className="media-section-heading">
              <div>
                <span className="media-eyebrow">CATÁLOGO ONLINE</span>
                <h3>Buscar música</h3>
              </div>
              {spotifySession && <span className="media-connected"><span /> Spotify conectado</span>}
            </div>

            {!clientId || !spotifySession ? (
              <div className="media-connect-panel">
                <div className="media-connect-icon"><Music2 size={23} /></div>
                <h4>{clientId ? "Conecta tu cuenta de Spotify" : "Configura Spotify"}</h4>
                <p>
                  Busca canciones y reprodúcelas en AutoDash Web para enviarlas desde Spotify Connect. Requiere Spotify Premium.
                </p>
                {!clientId || showClientIdForm ? (
                  <form className="media-client-form" onSubmit={saveSpotifyClientId}>
                    <label htmlFor="spotify-client-id">Client ID de Spotify</label>
                    <input
                      id="spotify-client-id"
                      autoComplete="off"
                      value={clientIdDraft}
                      onChange={(event) => setClientIdDraft(event.target.value)}
                      placeholder="Pega aquí el Client ID"
                    />
                    <button className="media-primary-button" type="submit">Guardar Client ID</button>
                  </form>
                ) : (
                  <div className="media-connect-actions">
                    <button className="media-primary-button" type="button" onClick={connectSpotify} disabled={isSpotifyHttpsLocalhost}>
                      Conectar Spotify
                    </button>
                    <button
                      className="media-quiet-button"
                      type="button"
                      onClick={() => setShowClientIdForm(true)}
                    >
                      Cambiar Client ID
                    </button>
                  </div>
                )}
                <small>
                  Añade esta Redirect URI en Spotify Developer: <code>{spotifyRedirectUri}</code>
                </small>
                {isSpotifyHttpsLocalhost && (
                  <small className="media-local-redirect-warning">
                    Spotify bloquea HTTPS localhost. Ejecuta <code>npm run dev:spotify</code> y abre <code>{spotifyRedirectUri}</code>.
                  </small>
                )}
              </div>
            ) : (
              <>
                <form className="media-search-form" onSubmit={searchSpotifyTracks}>
                  <Search size={18} aria-hidden="true" />
                  <input
                    aria-label="Buscar canciones en Spotify"
                    value={trackQuery}
                    onChange={(event) => setTrackQuery(event.target.value)}
                    placeholder="Canción, artista o álbum"
                  />
                  <button type="submit" disabled={trackSearchLoading || !trackQuery.trim()}>
                    {trackSearchLoading ? "Buscando" : "Buscar"}
                  </button>
                </form>
                <div className="media-result-list" aria-live="polite">
                  {tracks.map((track) => (
                    <button
                      className={`media-result-row ${selectedTrack?.id === track.id ? "selected" : ""}`}
                      type="button"
                      key={track.id}
                      onClick={() => void playSpotifyTrack(track)}
                    >
                      {track.album.images[2]?.url ? (
                        <img src={track.album.images[2].url} alt="" />
                      ) : (
                        <span className="media-result-cover"><Disc3 size={19} /></span>
                      )}
                      <span className="media-result-copy">
                        <strong>{track.name}</strong>
                        <small>{track.artists.map((artist) => artist.name).join(", ")} · {track.album.name}</small>
                      </span>
                      <span className="media-result-trailing">
                        <span className="media-result-duration">{formatTrackDuration(track.duration_ms)}</span>
                        <Play className="media-row-play" size={17} fill="currentColor" />
                      </span>
                    </button>
                  ))}
                  {!tracks.length && !trackSearchLoading && (
                    <p className="media-empty-state">Busca una canción para ver resultados.</p>
                  )}
                </div>
              </>
            )}
          </section>

          <section className="media-column media-now-playing">
            <div className="media-section-heading">
              <div>
                <span className="media-eyebrow">REPRODUCTOR</span>
                <h3>{displayedTrack ? "Reproduciendo" : "Tu reproductor"}</h3>
              </div>
              <Headphones size={20} />
            </div>
            <div className={`media-device-status ${spotifyPlayerStatus}`} role="status">
              <span className="media-device-dot" />
              <div>
                <strong>
                  {spotifyPlayerStatus === "ready"
                    ? "AutoDash Web disponible"
                    : spotifyPlayerStatus === "connecting"
                      ? "Conectando AutoDash Web"
                      : spotifyPlayerStatus === "error"
                        ? "Reproductor requiere atención"
                        : "Esperando dispositivo Spotify"}
                </strong>
                <span>En el teléfono: Dispositivos disponibles → AutoDash Web · requiere Spotify Premium</span>
              </div>
              <button type="button" className="media-activate-button" onClick={activateSpotifyAudio}>
                Activar audio
              </button>
            </div>
            {displayedTrack ? (
              <>
                <div className="media-featured-track">
                  <div className="media-featured-artwork">
                    {displayedTrack.album?.images?.[0]?.url ? (
                      <img src={displayedTrack.album.images[0].url} alt={`Portada de ${displayedTrack.album.name}`} />
                    ) : (
                      <Disc3 size={52} strokeWidth={1.3} />
                    )}
                  </div>
                  <div className="media-featured-copy">
                    <span className="media-featured-label">SELECCIÓN ACTUAL</span>
                    <strong>{displayedTrack.name}</strong>
                    <span>{displayedTrack.artists.map((artist) => artist.name).join(", ")}</span>
                    <small>
                      {displayedTrack.album?.name || "Spotify"} · {formatTrackDuration(
                        displayedTrack.duration_ms || spotifyPlaybackDuration
                      )}
                    </small>
                  </div>
                </div>
                {tracks.length > 1 && (
                  <div className="media-related-tracks">
                    <div className="media-related-heading">
                      <span>Recomendaciones para ti</span>
                      <small>Spotify</small>
                    </div>
                    <div className="media-related-list">
                      {tracks
                        .filter((track) => track.id !== displayedTrack.id)
                        .slice(0, 4)
                        .map((track) => (
                          <button
                            type="button"
                            key={track.id}
                            onClick={() => void playSpotifyTrack(track)}
                            aria-label={`Reproducir ${track.name}`}
                          >
                            {track.album.images[2]?.url && <img src={track.album.images[2].url} alt="" />}
                            <span>
                              <strong>{track.name}</strong>
                              <small>{track.artists.map((artist) => artist.name).join(", ")}</small>
                            </span>
                            <Play size={15} fill="currentColor" />
                          </button>
                        ))}
                    </div>
                  </div>
                )}
                <div className="media-sdk-controls">
                  <div className="media-track-timeline">
                    <span>{formatTrackDuration(spotifyPlaybackPosition)}</span>
                    <input
                      aria-label="Posición de reproducción"
                      type="range"
                      min="0"
                      max={spotifyPlaybackDuration || 1}
                      value={Math.min(spotifyPlaybackPosition, spotifyPlaybackDuration || 1)}
                      disabled={!spotifyDeviceId || !spotifyPlaybackDuration}
                      onChange={(event) => setSpotifyPlaybackPosition(Number(event.target.value))}
                      onPointerUp={seekSpotifyTrack}
                      onKeyUp={seekSpotifyTrack}
                    />
                    <span>{formatTrackDuration(spotifyPlaybackDuration)}</span>
                  </div>
                  <div className="media-transport-controls">
                    <button type="button" aria-label="Canción anterior" disabled={!spotifyDeviceId} onClick={() => skipSpotifyTrack("previous")}>
                      <SkipBack size={20} fill="currentColor" />
                    </button>
                    <button
                      type="button"
                      className="media-main-play-button"
                      aria-label={isSpotifyPlaying ? "Pausar" : "Reproducir"}
                      disabled={!spotifyDeviceId}
                      onClick={() => void toggleSpotifyPlayback()}
                    >
                      {isSpotifyPlaying ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" />}
                    </button>
                    <button type="button" aria-label="Siguiente canción" disabled={!spotifyDeviceId} onClick={() => skipSpotifyTrack("next")}>
                      <SkipForward size={20} fill="currentColor" />
                    </button>
                  </div>
                  <label className="media-volume-control">
                    <Volume2 size={17} />
                    <input
                      aria-label="Volumen de Spotify"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={spotifyPlayerVolume}
                      onChange={(event) => updateSpotifyVolume(event)}
                      disabled={!spotifyDeviceId}
                    />
                  </label>
                </div>
              </>
            ) : (
              <div className="media-player-placeholder">
                <div className="media-placeholder-disc"><Disc3 size={54} strokeWidth={1.2} /></div>
                <strong>Tu música, a tu manera</strong>
                <span>Busca una canción o envíala desde Spotify móvil a AutoDash Web.</span>
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="media-content media-radio-view">
          <section className="media-column media-radio-library">
            <div className="media-section-heading">
              <div>
                <span className="media-eyebrow">DIRECTORIO DE INTERNET</span>
                <h3>Emisoras</h3>
              </div>
              <span className="media-live-badge"><span /> EN LÍNEA</span>
            </div>
            <form className="media-search-form" onSubmit={searchRadio}>
              <Search size={18} aria-hidden="true" />
              <input
                aria-label="Buscar emisoras por nombre o frecuencia"
                value={radioQuery}
                onChange={(event) => setRadioQuery(event.target.value)}
                placeholder="Emisora, ciudad o género (ej. Jazz, México)"
              />
              <button type="submit" disabled={radioLoading}>
                {radioLoading ? "Buscando" : "Buscar"}
              </button>
            </form>
            <div className="media-result-list radio-result-list" aria-live="polite">
              {stations.map((station) => (
                <button
                  className={`media-result-row ${selectedStation?.stationuuid === station.stationuuid ? "selected" : ""}`}
                  type="button"
                  key={station.stationuuid}
                  onClick={() => void playStation(station)}
                >
                  {station.favicon ? (
                    <img src={station.favicon} alt="" />
                  ) : (
                    <span className="media-result-cover"><Radio size={19} /></span>
                  )}
                  <span className="media-result-copy">
                    <strong>{station.name}</strong>
                    <small>{[station.country, station.codec, station.bitrate ? `${station.bitrate} kbps` : ""].filter(Boolean).join(" · ")}</small>
                  </span>
                  <Play className="media-row-play" size={17} fill="currentColor" />
                </button>
              ))}
              {!radioLoading && !stations.length && !radioError && (
                <p className="media-empty-state">Busca por nombre de emisora, ciudad o frecuencia.</p>
              )}
            </div>
          </section>

          <section className="media-column media-radio-player">
            <div className="media-section-heading">
              <div>
                <span className="media-eyebrow">RADIO ONLINE</span>
                <h3>{selectedStation?.name || "Elige una emisora"}</h3>
              </div>
              <Radio size={20} />
            </div>
            <div className="radio-now-playing">
              <div className="radio-artwork"><Radio size={38} strokeWidth={1.5} /></div>
              <div className="radio-station-name">
                <strong>{selectedStation?.name || "AutoDash Radio"}</strong>
                <span>{selectedStation ? selectedStation.country || "Emisora online" : "Streams disponibles en internet"}</span>
              </div>
              <div className="radio-playback-controls">
                <button
                  className="radio-play-button"
                  type="button"
                  aria-label={radioPlaying ? "Pausar radio" : "Reanudar radio"}
                  disabled={!selectedStation}
                  onClick={toggleRadioPlayback}
                >
                  {radioPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                </button>
                <span>{radioPlaying ? "EN VIVO" : "STREAM"}</span>
              </div>
            </div>
            <div className="radio-audio-settings">
              <label htmlFor="radio-volume"><Volume2 size={17} /> Volumen</label>
              <input
                id="radio-volume"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={radioVolume}
                onChange={(event) => setRadioVolume(Number(event.target.value))}
              />
            </div>
          </section>
        </div>
      )}

      {spotifyError && mode === "music" && <p className="media-message error" role="alert">{spotifyError}</p>}
      {spotifyPlayerError && mode === "music" && <p className="media-message error" role="alert">{spotifyPlayerError}</p>}
      {spotifyNotice && mode === "music" && <p className="media-message" role="status">{spotifyNotice}</p>}
      {radioError && mode === "radio" && <p className="media-message error" role="alert">{radioError}</p>}

      <audio
        ref={radioAudioRef}
        className="media-audio-element"
        onPause={() => setRadioPlaying(false)}
        onPlay={() => setRadioPlaying(true)}
        onError={() => {
          setRadioPlaying(false);
          setRadioError("La emisora no está disponible en este momento.");
        }}
      />
    </div>
  );
}