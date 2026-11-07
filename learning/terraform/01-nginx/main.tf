# Terraform'un Docker ile konusmak icin kullanacagi provider.
terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "4.6.0"
    }
  }
}

# Bu Mac'teki Docker Desktop baglantisi.
provider "docker" {
  host = "unix://${pathexpand("~/.docker/run/docker.sock")}"
}

# Container'i baslatmak icin kullanilacak imaj.
resource "docker_image" "nginx" {
  name         = "nginx:stable-alpine"
  keep_locally = true
}

# "nginx" Terraform icindeki ad, "terraform-first-nginx" Docker'daki ad.
resource "docker_container" "nginx" {
  name  = "terraform-first-nginx"
  image = docker_image.nginx.image_id

  ports {
    internal = 80
    external = var.host_port
    ip       = "127.0.0.1"
  }
  networks_advanced {
    name = docker_network.lab.name
  }
}
variable "host_port" {
  type    = number
  default = 8089
}