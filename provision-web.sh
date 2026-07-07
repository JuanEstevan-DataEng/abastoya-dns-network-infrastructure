#!/bin/bash

# Update and install Apache2
apt-get update
apt-get install -y apache2

# Create a new virtual host pointing to the shared folder
cat <<EOF > /etc/apache2/sites-available/abastoya.conf
<VirtualHost *:80>
    ServerName www.abastoya.com
    ServerAlias abastoya.com
    DocumentRoot /vagrant/sitio2
    <Directory /vagrant/sitio2>
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>
EOF

# Enable the new site and disable the default one
a2ensite abastoya.conf
a2dissite 000-default.conf

# Restart Apache to apply changes
systemctl restart apache2

# Set the DNS resolver to point to our DNS server
echo "nameserver 192.168.100.2" > /etc/resolv.conf
