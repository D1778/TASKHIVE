# TaskHive — Multi-Container SaaS with Docker Compose

TaskHive is a multi-tenant project and task management SaaS (workspaces, projects, Kanban boards,
team roles, dashboards, and a company logo). It is deployed as **four containers** with Docker
Compose. The containers use **two isolated networks** and **three named volumes**.

## Architecture

```
                        ┌──────────────────── frontend_net (bridge) ────────────────────┐
  Browser ──:8080──►    │  frontend (nginx:1.27-alpine)  ──/api──►  backend (Node 22)   │
                        └────────────────────────────────────────────────┬──────────────┘
                                                                         │ (attached to both)
                        ┌──────────────── backend_net (bridge, internal: true) ─────────┐
                        │        db (postgres:16-alpine)      redis (redis:7-alpine)     │
                        └────────────────────────────────────────────────────────────────┘
```

| Service    | Image / build        | Role                                              | Networks                  | Volume                       |
|------------|----------------------|---------------------------------------------------|---------------------------|------------------------------|
| `frontend` | `./frontend` (nginx) | Serves the SPA and reverse-proxies `/api` to the API | frontend_net              | –                            |
| `backend`  | `./backend` (Node)   | REST API: auth (JWT), projects, tasks, team, stats | frontend_net, backend_net | `app_logs` → `/app/logs`     |
| `db`       | postgres:16-alpine   | Primary data store                                | backend_net               | `pg_data` → `/var/lib/postgresql/data` |
| `redis`    | redis:7-alpine       | Dashboard cache and login rate limiting (AOF on)  | backend_net               | `redis_data` → `/data`       |

**Design decisions**
- Only nginx publishes a port (`8080:80`). The API, DB, and Redis have no ports on the host.
- `backend_net` is `internal: true`. The DB and Redis have no internet access and cannot be reached from nginx.
- Containers find each other by service name (`backend`, `db`, `redis`) through Docker's embedded DNS.
- `depends_on` with `condition: service_healthy` starts the services in order: db/redis → backend → frontend.
- The API runs as a non-root user, hashes passwords with bcrypt, keeps each workspace's data isolated from other tenants, and uses parameterized SQL.

## Project layout

```
LAB-4/
├── docker-compose.yml
├── .env / .env.example        # credentials & port
├── backend/                   # Express API
│   ├── Dockerfile
│   └── src/ (server, db, cache, routes/)
├── frontend/                  # nginx + SPA
│   ├── Dockerfile
│   ├── nginx.conf
│   └── public/ (index.html, styles.css, app.js)
└── scripts/validate.ps1       # automated networking + storage validation
```

## Run it

```powershell
docker compose up -d --build --wait     # build and start, wait until all are healthy
docker compose ps                       # status
```

Open **http://localhost:8080**, click **Create a workspace**, and you're in. New workspaces start empty.

Stop: `docker compose down` (keeps data) · Full reset: `docker compose down -v` (deletes volumes)

**Podman:** the same file works with `podman compose up -d --build` (or `podman-compose`).

## Validate networking & storage

Automated (30 checks):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\validate.ps1
```

It checks container health, network membership, DNS service discovery, allowed and blocked paths,
host port exposure, and volume mounts. It then writes data to PostgreSQL, Redis, and the log volume,
runs `docker compose down` and `up`, and confirms that the data is still there.

### Manual commands (for the lab report)

```powershell
# --- Networking ---
docker network ls --filter name=taskhive
docker network inspect taskhive_backend_net -f "{{.Internal}}"                 # true
docker network inspect taskhive_frontend_net -f "{{range .Containers}}{{.Name}} {{end}}"
docker network inspect taskhive_backend_net  -f "{{range .Containers}}{{.Name}} {{end}}"

docker exec taskhive-frontend wget -qO- http://backend:5000/api/health        # works (DNS + HTTP)
docker exec taskhive-frontend nc -z -w 3 db 5432                              # fails: bad address 'db'
docker exec taskhive-db wget -T 3 -qO- http://example.com                     # fails: no internet
docker exec taskhive-backend cat /etc/hosts                                   # two IPs, one per network

# --- Storage ---
docker volume ls --filter name=taskhive
docker volume inspect taskhive_pg_data
docker exec taskhive-db psql -U taskhive -d taskhive -c "SELECT id, name FROM projects;"
docker exec taskhive-redis redis-cli SET demo hello
docker compose down; docker compose up -d --wait                              # recreate containers
docker exec taskhive-redis redis-cli GET demo                                 # "hello" persisted
docker exec taskhive-backend tail -n 3 /app/logs/access.log
```

The app's **System status** page shows the same information live: container hostname, the API's two
network interfaces, DB size, Redis keys and AOF status, and the network topology.

## API reference

| Method | Endpoint                 | Description                          |
|--------|--------------------------|--------------------------------------|
| GET    | `/api/health`            | Health of API, DB and cache (public) |
| POST   | `/api/auth/register`     | Create a workspace and owner account |
| POST   | `/api/auth/login`        | Log in and get a JWT                 |
| GET    | `/api/auth/me`           | Current user and workspace           |
| GET/POST/PATCH/DELETE | `/api/projects[/:id]` | Project CRUD |
| GET/POST/PATCH/DELETE | `/api/tasks[/:id]`    | Task CRUD, filter by `project_id`, `status`, `assignee_id` |
| GET    | `/api/dashboard`         | Aggregated stats, cached in Redis for 60 s |
| GET/POST/DELETE | `/api/team[/:id]` | Workspace members                    |
| PATCH  | `/api/workspace`         | Rename workspace or upload/remove the company logo (owner/admin) |
| GET    | `/api/activity`          | Activity feed                        |
| GET    | `/api/system`            | Infrastructure introspection         |
