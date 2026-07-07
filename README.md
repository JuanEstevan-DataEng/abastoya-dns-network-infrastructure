# AbastoYa — Network Infrastructure (DNS + Web) with Vagrant

The **AbastoYa** platform deployed on a **classic network infrastructure** (not containers): two
virtualized Ubuntu servers provisioned with **Vagrant**, one acting as an authoritative **DNS server
(BIND9)** for the `abastoya.com` domain and another as an **Apache web server** hosting the site.
Final project for the Networks course, focused on DNS, virtualization, private networking, and
provisioning.

**Stack:** Vagrant · Ubuntu 22.04 (2 VMs, private network) · BIND9 (DNS) · Apache2 (virtual hosts) ·
Node.js/Express microservices · MySQL · static HTML site

## Architecture

Two VMs on a private network, defined in the `Vagrantfile` and configured by the provisioning scripts:

| VM | Role | Provisioning | Key software |
|---|---|---|---|
| **server1** | Authoritative DNS + database | `provision-servidor1.sh` | BIND9 (zone `abastoya.com`), MySQL (restores `backup_db.sql`) |
| **web** | Web server | `provision-web.sh` | Apache2 serving `sitio2/`, Node.js microservices |

- **DNS (`dns/`):** BIND9 configuration — forward zone (`db.abastoya.com`), reverse zone
  (`db.100.168.192`), local zone (`db.local`), and `named.conf.local` / `named.conf.options`.
- **Web (`sitio2/`, `sitio2.conf`):** static HTML front-end (login, dashboards and management pages
  per role: admin / client / provider) served through an Apache virtual host.
- **Microservices (`MICROSERVICIOS/`):** the five Express services (Users, Products, Contracts,
  Payments, Deliveries). Database credentials are read from the `DB_PASSWORD` environment variable
  (never hardcoded).
- **Database (`Workbench/`, `backup_db.sql`):** MySQL Workbench SQL scripts and a seed dump restored
  during provisioning.

## How to run

```bash
# Bring up both VMs and run the provisioning scripts
vagrant up

# (helper) start the environment
./iniciar_entorno.sh
```

Add the DNS server to your resolver (or point `/etc/hosts`) so `abastoya.com` resolves to the web VM,
then browse the site. To connect to MySQL, set `DB_PASSWORD` in the environment before starting the
microservices.

## Project structure

```
├── Vagrantfile               # 2 Ubuntu VMs on a private network
├── provision-servidor1.sh    # DNS (BIND9) + MySQL provisioning
├── provision-web.sh          # Apache + microservices provisioning
├── iniciar_entorno.sh        # environment startup helper
├── dns/                      # BIND9 zone files and named.conf
├── sitio2/                   # static HTML site (per-role pages)
├── sitio2.conf               # Apache virtual host
├── MICROSERVICIOS/           # 5 Express microservices
├── Workbench/                # MySQL DDL scripts (*.sql)
└── backup_db.sql             # seed database dump (restored on provisioning)
```

> **Security note:** database passwords are read from the `DB_PASSWORD` environment variable and are
> not committed. Set your own value before running.

---
**Course:** Networks (Redes) — Data Engineering & AI, Universidad Autónoma de Occidente.
