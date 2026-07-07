# -*- mode: ruby -*-
# vi: set ft=ruby :
Vagrant.configure("2") do |config|
  # Use the libvirt provider
  config.vm.define :servidorUbuntu1 do |servidorUbuntu1|
    servidorUbuntu1.vm.box = "bento/ubuntu-22.04"
    servidorUbuntu1.vm.network :private_network, ip: "192.168.100.2"
    servidorUbuntu1.vm.hostname = "servidorUbuntu1"
    servidorUbuntu1.vm.box_download_insecure=true
    servidorUbuntu1.vm.provision "shell", path: "provision-servidor1.sh"
  end

  config.vm.define :servidorUbuntu2 do |servidorUbuntu2|
    servidorUbuntu2.vm.box = "bento/ubuntu-22.04"
    servidorUbuntu2.vm.network :private_network, ip: "192.168.100.3"
    servidorUbuntu2.vm.hostname = "servidorUbuntu2"
    servidorUbuntu2.vm.box_download_insecure=true
    servidorUbuntu2.vm.provision "shell", path: "provision-web.sh"
  end
end
