#!/bin/bash

# --- General Update and Package Installation ---
echo "Updating packages and installing base dependencies..."
apt-get update
apt-get install -y bind9 curl mysql-server rsync

# --- Node.js Installation ---
echo "Installing Node.js..."
apt-get install -y ca-certificates
curl -fsSL https://deb.nodesource.com/setup_current.x | bash -
apt-get install -y nodejs

# --- BIND9 (DNS Server) Configuration ---
echo "Configuring BIND9 DNS server..."
systemctl stop bind9
cp /vagrant/dns/named.conf.options /etc/bind/named.conf.options
cp /vagrant/dns/named.conf.local /etc/bind/named.conf.local
cp /vagrant/dns/db.abastoya.com /etc/bind/db.abastoya.com
cp /vagrant/dns/db.100.168.192 /etc/bind/db.100.168.192
cp /vagrant/dns/db.local /etc/bind/db.local
chown -R bind:bind /etc/bind
systemctl start bind9
systemctl enable bind9

# --- MySQL Database Configuration ---
echo "Configuring MySQL database..."
systemctl start mysql
systemctl enable mysql

# Set a password and change auth method for the root user, as requested.
echo "Securing MySQL and setting root password..."
mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'changeme';"
mysql -e "CREATE USER IF NOT EXISTS 'root'@'%' IDENTIFIED WITH mysql_native_password BY 'changeme';"
mysql -e "GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' WITH GRANT OPTION;"
mysql -e "FLUSH PRIVILEGES;"

# Import the database dump
echo "Importing database from /vagrant/backup_db.sql..."
mysql -u root -p'changeme' < /vagrant/backup_db.sql

# --- Microservices Deployment ---
echo "Deploying Node.js microservices..."
# Define an array of service names by listing directories, excluding 'Workbench'
SERVICES=($(ls -d /vagrant/MICROSERVICIOS/*/ | xargs -n 1 basename | grep -v 'Workbench'))

for SERVICE in "${SERVICES[@]}"; do
    echo "--> Deploying $SERVICE"
    
    # 1. Copy service files
    DEST_DIR="/home/vagrant/$SERVICE"
    mkdir -p "$DEST_DIR"
    # Use rsync for better copy and to exclude node_modules if it exists
    rsync -av --exclude 'node_modules' "/vagrant/MICROSERVICIOS/$SERVICE/" "$DEST_DIR/"
    
    # 2. Install npm dependencies
    echo "    Running npm install in $DEST_DIR"
    # Run npm install as the vagrant user
    su - vagrant -c "cd $DEST_DIR && npm install"
    
    # 3. Set ownership
    chown -R vagrant:vagrant "/home/vagrant/$SERVICE"
    
    # 4. Create systemd service
    echo "    Creating systemd service for $SERVICE"
    cat <<EOF > "/etc/systemd/system/$SERVICE.service"
[Unit]
Description=Microservicio $SERVICE
After=network.target mysql.service

[Service]
User=vagrant
Group=vagrant
WorkingDirectory=$DEST_DIR/src
ExecStart=/usr/bin/node index.js
Restart=always

[Install]
WantedBy=multi-user.target
EOF

    # 5. Enable and start the service
    systemctl daemon-reload
    systemctl enable "$SERVICE.service"
    systemctl start "$SERVICE.service"
done

# --- Final DNS Configuration ---
echo "Setting final DNS resolver for the VM..."
echo "nameserver 192.168.100.2" > /etc/resolv.conf

echo "Provisioning for servidorUbuntu1 complete!"
