#!/bin/bash
# Este script prepara el entorno de desarrollo de Abasto Ya.

echo "==> Paso 1: Deteniendo Docker y descargando módulos KVM para VirtualBox..."
# Detener el servicio de Docker Desktop que usa KVM
systemctl --user stop docker-desktop.service
# Descargar los módulos del kernel de KVM
sudo modprobe -r kvm_amd
sudo modprobe -r kvm
echo "Módulos KVM desactivados."

echo "==> Paso 2: Activando el DNS del proyecto en el sistema..."
# Descomenta la línea de DNS en resolved.conf para usar el DNS de la VM
sudo sed -i 's/^#DNS=.*/DNS=192.168.100.2/' /etc/systemd/resolved.conf
echo "Archivo de configuración de DNS modificado."

echo "==> Paso 3: Reiniciando el servicio de DNS para aplicar los cambios..."
sudo systemctl restart systemd-resolved.service
echo "Servicio de DNS reiniciado."

echo "==> Paso 4: Iniciando las máquinas virtuales con Vagrant (libvirt)..."
vagrant up

echo ""
echo "¡Entorno listo! Ahora deberías poder acceder a http://www.abastoya.com"
echo "Usa './iniciar_entorno.sh' para empezar a trabajar."
