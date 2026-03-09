// Port assignment API for frp tunneling (iHostMC).
// MIT License - see LICENSE in repo root.

package main

import (
	"encoding/json"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"
)

const (
	defaultPortMin = 20000
	defaultPortMax = 60000
	defaultAddr   = ":8080"
)

type Config struct {
	Token      string
	AllowedHost string // optional: only accept requests with this Host (e.g. play.ihost.one)
	PortMin   int
	PortMax   int
	Addr      string
}

type AssignResponse struct {
	Port int `json:"port"`
}

type ErrorResponse struct {
	Error string `json:"error"`
}

var (
	usedPorts   = make(map[int]bool)
	usedPortsMu sync.Mutex
)

func loadConfig() Config {
	c := Config{
		Token:       os.Getenv("FRP_API_TOKEN"),
		AllowedHost: os.Getenv("FRP_ALLOWED_HOST"), // e.g. play.ihost.one
		PortMin:     defaultPortMin,
		PortMax:     defaultPortMax,
		Addr:        defaultAddr,
	}
	if v := os.Getenv("FRP_PORT_MIN"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			c.PortMin = n
		}
	}
	if v := os.Getenv("FRP_PORT_MAX"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			c.PortMax = n
		}
	}
	if v := os.Getenv("FRP_API_ADDR"); v != "" {
		c.Addr = v
	}
	return c
}

func allowedHost(next http.HandlerFunc, allowed string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if allowed == "" {
			next(w, r)
			return
		}
		host, _, err := net.SplitHostPort(r.Host)
		if err != nil {
			host = r.Host
		}
		if host != allowed {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		next(w, r)
	}
}

func auth(next http.HandlerFunc, token string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if token == "" {
			writeJSONError(w, http.StatusInternalServerError, "FRP_API_TOKEN not set")
			return
		}
		got := r.Header.Get("Authorization")
		if got == "" {
			got = r.URL.Query().Get("token")
		}
		if got != "Bearer "+token && got != token {
			writeJSONError(w, http.StatusUnauthorized, "invalid token")
			return
		}
		next(w, r)
	}
}

func writeJSONError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(ErrorResponse{Error: msg})
}

func assignPort(w http.ResponseWriter, r *http.Request, portMin, portMax int) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	usedPortsMu.Lock()
	defer usedPortsMu.Unlock()
	for port := portMin; port <= portMax; port++ {
		if !usedPorts[port] {
			usedPorts[port] = true
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(AssignResponse{Port: port})
			log.Printf("assigned port %d", port)
			return
		}
	}
	writeJSONError(w, http.StatusServiceUnavailable, "no free port")
}

func releasePort(w http.ResponseWriter, r *http.Request, portMin, portMax int) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	portStr := r.PathValue("port")
	if portStr == "" {
		writeJSONError(w, http.StatusBadRequest, "missing port")
		return
	}
	port, err := strconv.Atoi(portStr)
	if err != nil || port < portMin || port > portMax {
		writeJSONError(w, http.StatusBadRequest, "invalid port")
		return
	}
	usedPortsMu.Lock()
	delete(usedPorts, port)
	usedPortsMu.Unlock()
	w.WriteHeader(http.StatusNoContent)
	log.Printf("released port %d", port)
}

func main() {
	cfg := loadConfig()
	if cfg.Token == "" {
		log.Fatal("FRP_API_TOKEN environment variable is required")
	}

	mux := http.NewServeMux()
	assignHandler := auth(func(w http.ResponseWriter, r *http.Request) {
		assignPort(w, r, cfg.PortMin, cfg.PortMax)
	}, cfg.Token)
	releaseHandler := auth(func(w http.ResponseWriter, r *http.Request) {
		releasePort(w, r, cfg.PortMin, cfg.PortMax)
	}, cfg.Token)
	mux.HandleFunc("POST /assign-port", allowedHost(assignHandler, cfg.AllowedHost))
	mux.HandleFunc("POST /release-port/{port}", allowedHost(releaseHandler, cfg.AllowedHost))

	srv := &http.Server{
		Addr:         cfg.Addr,
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}
	log.Printf("frp port-api listening on %s (ports %d-%d)", cfg.Addr, cfg.PortMin, cfg.PortMax)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
