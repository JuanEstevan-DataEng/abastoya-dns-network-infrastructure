;
; BIND data file for local loopback interface
;
$TTL	604800
@	IN	SOA	abastoya.com. root.abastoya.com. (
			      1		; Serial
			 604800		; Refresh
			  86400		; Retry
			2419200		; Expire
			 604800 )	; Negative Cache TTL
;
@	IN	NS	tyler.abastoya.com.

; Lista de maquinas
tyler	IN	A	192.168.100.2
josh	IN	A	192.168.100.3
www	IN	CNAME	josh
