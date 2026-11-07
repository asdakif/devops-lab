output "nginx_url" {
  description = "Nginx'e bilgisayardan erisim adresi"
  value       = "http://localhost:${var.host_port}"
}

output "network_name" {
  description = "Container'larin ortak Docker agi"
  value       = docker_network.lab.name
}