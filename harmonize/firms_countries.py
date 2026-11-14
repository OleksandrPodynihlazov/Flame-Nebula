"""FIRMS yearly-archive country names (file name part, `modis_2008_<Name>.csv`) -> ISO 3166-1 alpha-3.

Only the Europe preset of ingest/regions_scope.py that FIRMS publishes (41 of 45: no files for
LIE, MCO, SMR, VAT). A file whose name is not here is skipped and reported, never guessed.
"""

FIRMS_TO_ISO3 = {
    "Albania": "ALB", "Andorra": "AND", "Austria": "AUT", "Belarus": "BLR", "Belgium": "BEL",
    "Bosnia_and_Herzegovina": "BIH", "Bulgaria": "BGR", "Croatia": "HRV", "Cyprus": "CYP",
    "Czech_Republic": "CZE", "Denmark": "DNK", "Estonia": "EST", "Finland": "FIN", "France": "FRA",
    "Germany": "DEU", "Greece": "GRC", "Hungary": "HUN", "Iceland": "ISL", "Ireland": "IRL", "Italy": "ITA",
    "Kosovo": "XKX", "Latvia": "LVA", "Lithuania": "LTU", "Luxembourg": "LUX",
    "Macedonia_Former_Yugoslav_Republic_of": "MKD", "Malta": "MLT", "Moldova": "MDA", "Montenegro": "MNE",
    "Netherlands": "NLD", "Norway": "NOR", "Poland": "POL", "Portugal": "PRT", "Romania": "ROU",
    "Serbia": "SRB", "Slovakia": "SVK", "Slovenia": "SVN", "Spain": "ESP", "Sweden": "SWE",
    "Switzerland": "CHE", "Ukraine": "UKR", "United_Kingdom": "GBR",
}
